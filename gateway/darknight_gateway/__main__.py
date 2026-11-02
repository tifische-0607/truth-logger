"""Command line: run the gateway, check the mapping, reconcile paths, verify the log.

    python -m darknight_gateway serve       # start (127.0.0.1:8787 by default)
    python -m darknight_gateway check       # run every mapping query once per collection
    python -m darknight_gateway reconcile [--out FILE.csv] [--orphans] [--collection NAME]
                                            # read-only report: which DarkNight paths resolve,
                                            # which are missing or ambiguous, and (with
                                            # --orphans) evidence files no row points at
    python -m darknight_gateway verify-log  # check the custody log's hash chain

Nothing here writes to DarkNight or the NAS. Reconcile never moves or renames
files and never matches a missing path to another file by its name.
"""

from __future__ import annotations

import csv
import sys
from collections import Counter
from pathlib import Path

from .config import load_settings

EVIDENCE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".mov", ".webm",
                     ".m4a", ".mp3", ".pdf", ".html", ".mhtml", ".warc", ".json"}
SKIP_NAMES = {"HASHES.sha256.json", "HASHES_CASE.sha256.json", ".DS_Store"}


def _arg(argv: list[str], flag: str) -> str | None:
    return argv[argv.index(flag) + 1] if flag in argv and argv.index(flag) + 1 < len(argv) else None


def cmd_check(settings) -> int:
    from .db import Database
    from .mapping import load_mapping

    mapping = load_mapping(settings.mapping_path)
    db = Database(settings.database_url)
    db.open()
    ok = True
    sample = {"q": None, "platform": None, "item_type": None, "date_from": None,
              "date_to": None, "limit": 1, "offset": 0}
    for coll in mapping.collections.values():
        print(f"[{coll.name}] {coll.label}")
        try:
            total = (db.fetch_one(coll.sql("count"), {}) or {}).get("total")
            print(f"  count: ok ({total} rows)")
            rows = db.fetch_all(coll.sql("search"), sample)
            ok &= _report("search", rows, coll.queries["search"].returns)
            if rows:
                rid = rows[0]["record_id"]
                for sub in ("record", "files"):
                    ok &= _report(sub, db.fetch_all(coll.sql(sub), {"record_id": rid}),
                                  coll.queries[sub].returns, f" for record {rid}")
            ok &= _report("paths", db.fetch_all(coll.sql("paths"), {}), coll.queries["paths"].returns)
        except Exception as exc:  # noqa: BLE001
            print(f"  FAILED: {exc}")
            ok = False
    print("Share root:", settings.nas_evidence_root,
          "found" if settings.nas_evidence_root.is_dir() else "NOT FOUND")
    db.close()
    return 0 if ok else 1


def _report(name: str, rows: list[dict], returns: list[str], suffix: str = "") -> bool:
    cols = set(rows[0].keys()) if rows else set()
    missing = [c for c in returns if rows and c not in cols]
    print(f"  {name}: ok ({len(rows)} rows{suffix})" + (f", missing {missing}" if missing else ""))
    return not missing


def cmd_reconcile(settings, argv: list[str]) -> int:
    from .db import Database
    from .mapping import load_mapping
    from .paths import OK, ManifestReader, resolve

    mapping = load_mapping(settings.mapping_path)
    root = settings.nas_evidence_root
    if not root.is_dir():
        print(f"Share root {root} not found; mount it read-only first.")
        return 1
    only = _arg(argv, "--collection")
    out_path = Path(_arg(argv, "--out") or settings.state_dir / "reconcile.csv")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    manifests = ManifestReader(root, mapping.manifests)
    db = Database(settings.database_url)
    db.open()
    seen: set[Path] = set()
    totals: dict[str, Counter] = {}
    with out_path.open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["collection", "record_id", "file_id", "status", "stored_path",
                    "resolved_path", "resolved_via", "db_hash", "post_manifest_hash",
                    "case_manifest", "timestamped", "note"])
        for coll in mapping.collections.values():
            if only and coll.name != only:
                continue
            counts = totals.setdefault(coll.name, Counter())
            for row in db.fetch_all(coll.sql("paths"), {}):
                res = resolve(root, row.get("rel_path"), coll, mapping)
                counts[res.status] += 1
                base = {"post_manifest": None, "case_manifest_path": None, "timestamped": False}
                if res.status == OK and res.path is not None:
                    seen.add(res.path)
                    base = manifests.baselines(res.path)
                    if not (row.get("sha256_stored") or base.get("post_manifest") or base.get("case_manifest")):
                        counts["no_baseline"] += 1
                w.writerow([coll.name, f"{coll.name}.{row['record_id']}", row.get("file_id"), res.status,
                            row.get("rel_path"), res.rel_path, res.via, row.get("sha256_stored") or "",
                            base.get("post_manifest") or "", base.get("case_manifest_path") or "",
                            "yes" if base.get("timestamped") else "", res.reason or ""])
        orphans = 0
        if "--orphans" in argv and mapping.darknight_root:
            dn = (root / mapping.darknight_root).resolve()
            for path in sorted(dn.rglob("*")) if dn.is_dir() else []:
                if (path.is_file() and path.suffix.lower() in EVIDENCE_SUFFIXES
                        and path.name not in SKIP_NAMES and path.resolve() not in seen):
                    orphans += 1
                    w.writerow(["", "", "", "ORPHAN", "", path.relative_to(root.resolve()).as_posix(),
                                "", "", "", "", "", "file on the share that no DarkNight row points at"])
    db.close()
    for name, counts in totals.items():
        summary = ", ".join(f"{k} {v}" for k, v in sorted(counts.items()))
        print(f"{name}: {summary}")
    if "--orphans" in argv:
        print(f"orphans: {orphans}")
    print(f"Report written to {out_path} (nothing was changed).")
    return 0


def main(argv: list[str]) -> int:
    command = argv[1] if len(argv) > 1 else "serve"
    settings = load_settings()

    if command == "serve":
        import uvicorn

        from .app import create_app

        uvicorn.run(create_app(settings), host=settings.host, port=settings.port,
                    proxy_headers=True, forwarded_allow_ips="127.0.0.1")
        return 0
    if command == "check":
        return cmd_check(settings)
    if command == "reconcile":
        return cmd_reconcile(settings, argv[2:])
    if command == "verify-log":
        from .audit import verify_chain

        ok, count, message = verify_chain(settings.state_dir / "custody-log.jsonl")
        print(f"{message} ({count} entries)")
        return 0 if ok else 1

    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
