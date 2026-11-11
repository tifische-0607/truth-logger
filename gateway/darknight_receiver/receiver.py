#!/usr/bin/env python3
"""DarkNight receiver: implements docs/vault/u3-evidence-move-gateway-contract.md on the home machine.

Stdlib only. Listens on 127.0.0.1; Tailscale Funnel publishes it over HTTPS (*.ts.net).
Write-once: an existing file is never overwritten. Every caller must hold a valid FA Portal
staff session (checked against the portal's auth on each request).
"""
import hashlib, json, os, re, sys, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(os.environ.get("DARKNIGHT_ROOT", str(Path.home() / "DarkNight"))).resolve()
PORT = int(os.environ.get("DARKNIGHT_PORT", "8443"))
PORTAL_ORIGIN = os.environ.get("PORTAL_ORIGIN", "https://portal.fridayanalytics.org")
SUPABASE_URL = os.environ["PORTAL_AUTH_URL"].rstrip("/")
SUPABASE_KEY = os.environ["PORTAL_PUBLISHABLE_KEY"]
MAX_BYTES = 500 * 1024 * 1024
PATH_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/@-]*$")
ALLOWED_ORIGINS = {PORTAL_ORIGIN, *filter(None, os.environ.get("EXTRA_ORIGINS", "").split(","))}


def safe(area: str, rel: str) -> Path:
    if not PATH_RE.match(rel) or ".." in rel or "//" in rel:
        raise ValueError("Invalid DarkNight path")
    p = (ROOT / area / rel).resolve()
    if not str(p).startswith(str(ROOT / area) + os.sep):
        raise ValueError("Invalid DarkNight path")
    return p


def staff_ok(token: str) -> bool:
    """Valid session AND the portal's staff-only vault_status succeeds as that user."""
    h = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        urllib.request.urlopen(urllib.request.Request(f"{SUPABASE_URL}/auth/v1/user", headers=h), timeout=10).read()
        urllib.request.urlopen(urllib.request.Request(f"{SUPABASE_URL}/rest/v1/rpc/vault_status", data=b"{}", headers=h, method="POST"), timeout=10).read()
        return True
    except Exception:
        return False


def write_once(p: Path, data: bytes) -> bool:
    p.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o440)
    except FileExistsError:
        return False
    with os.fdopen(fd, "wb") as f:
        f.write(data); f.flush(); os.fsync(f.fileno())
    return True


sha = lambda b: hashlib.sha256(b).hexdigest()


class H(BaseHTTPRequestHandler):
    server_version = "DarkNight/1"

    def cors(self):
        o = self.headers.get("Origin")
        if o in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", o)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Expected-SHA256")
            self.send_header("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS")

    def reply(self, code, body=b"", ctype="application/json"):
        if isinstance(body, (dict, list)): body = json.dumps(body).encode()
        self.send_response(code); self.cors()
        self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store"); self.end_headers(); self.wfile.write(body)

    def do_OPTIONS(self): self.reply(204)

    def route(self):
        m = re.match(r"^/v1/(evidence-move/receive|evidence|outputs)(?:/(.*))?$", self.path.split("?")[0])
        if not m: return None, None
        rel = "/".join(urllib.request.unquote(s) for s in m.group(2).split("/")) if m.group(2) else ""
        return m.group(1), rel

    def authed(self):
        a = self.headers.get("Authorization", "")
        if not a.startswith("Bearer ") or not staff_ok(a[7:]):
            self.reply(401, {"error": "Not authorised"}); return False
        return True

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BYTES: raise ValueError("Too large")
        return self.rfile.read(n)

    def do_GET(self):
        if self.path == "/health": return self.reply(200, {"status": "online", "root_writable": os.access(ROOT, os.W_OK)})
        area, rel = self.route()
        if area not in ("evidence", "outputs") or not rel: return self.reply(404, {"error": "Not found"})
        if not self.authed(): return
        try: p = safe(area, rel)
        except ValueError as e: return self.reply(400, {"error": str(e)})
        if not p.is_file(): return self.reply(404, {"error": "Not found"})
        self.reply(200, p.read_bytes(), "application/octet-stream")

    def do_PUT(self):
        area, rel = self.route()
        if area != "outputs" or not rel: return self.reply(404, {"error": "Not found"})
        if not self.authed(): return
        try: p, data = safe(area, rel), self.body()
        except ValueError as e: return self.reply(400, {"error": str(e)})
        if not write_once(p, data): return self.reply(409, {"error": "Exists; not overwritten"})
        self.reply(200, {"path": rel, "sha256": sha(p.read_bytes())})

    def do_POST(self):
        area, _ = self.route()
        if area != "evidence-move/receive": return self.reply(404, {"error": "Not found"})
        if not self.authed(): return
        try:
            j = json.loads(self.body()); rel = j["path"]; p = safe("evidence", rel)
            src = j["source_url"]
            if not src.startswith(SUPABASE_URL + "/storage/v1/"): raise ValueError("Source must be the portal's signed link")
        except (ValueError, KeyError, json.JSONDecodeError) as e: return self.reply(400, {"error": str(e)})
        if not p.exists():
            try: data = urllib.request.urlopen(src, timeout=120).read(MAX_BYTES + 1)
            except Exception: return self.reply(502, {"error": "Source unreadable"})
            if len(data) > MAX_BYTES: return self.reply(413, {"error": "Too large"})
            write_once(p, data)
        # Report DarkNight's own hash of what it holds; the portal's database judges it.
        self.reply(200, {"path": rel, "sha256": sha(p.read_bytes())})

    def log_message(self, fmt, *args):  # no tokens or bodies in logs
        sys.stderr.write("%s %s\n" % (self.command, self.path.split("?")[0]))


if __name__ == "__main__":
    for a in ("evidence", "outputs"): (ROOT / a).mkdir(parents=True, exist_ok=True)
    print(f"DarkNight receiver on 127.0.0.1:{PORT}, files in {ROOT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
