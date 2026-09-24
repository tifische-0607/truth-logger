"""Facebook capture with a logged-in Chromium profile.

Produces, for one post URL:
  - live_post.png          full-page screenshot of the post (LIVE SCREENSHOT)
  - live_post.pdf          print-to-PDF of the same page
  - comments_page.html     raw DOM of the comments view (raw_extract)
  - link.txt               the permalink, as captured
  - post text + comments   parsed from the DOM

Everything is returned as plain dicts; nothing here talks to the app.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from playwright.sync_api import Page, sync_playwright

from . import config

Logger = Callable[[str], None]
ProgressReporter = Callable[[int, str], None]


def _browser_channel() -> dict:
    """Use installed Google Chrome (plays Facebook video); fall back to bundled Chromium."""
    import os
    ch = os.environ.get("BROWSER_CHANNEL", "chrome").strip()
    if ch and os.path.exists("/Applications/Google Chrome.app"):
        return {"channel": ch}
    return {}


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


_NO_HANDLE = {"share", "watch", "reel", "reels", "story.php", "permalink.php",
              "groups", "photo", "photo.php", "video.php", "events", "l.php", "help",
              "policies", "privacy", "business", "settings", "login", "legal", "ads", ""}


def handle_from_url(url: str) -> str:
    """Page handle from a Facebook URL, or "unknown". Never raises."""
    try:
        from urllib.parse import urlparse, parse_qs
        p = urlparse(url or "")
        if "facebook.com" not in (p.netloc or "").lower():
            return "unknown"
        parts = [s for s in (p.path or "").split("/") if s]
        first = parts[0] if parts else ""
        if first == "profile.php":
            ids = parse_qs(p.query or "").get("id") or []
            return ids[0] if ids and ids[0] else "unknown"
        if first == "people" and len(parts) >= 3:
            return parts[2]
        if first == "groups" and len(parts) >= 4 and parts[2] == "user":
            return parts[3]
        if first.lower() in _NO_HANDLE:
            return "unknown"
        return first
    except Exception:
        return "unknown"


def post_id_from_url(url: str) -> str:
    for pattern in (
        r"/posts/(?:pfbid)?([A-Za-z0-9]+)",
        r"story_fbid=(\d+)",
        r"/videos/(\d+)",
        r"/permalink/(\d+)",
        r"/([0-9]{6,})/?$",
    ):
        m = re.search(pattern, url)
        if m:
            return m.group(1)
    return hashlib.sha256(url.encode()).hexdigest()[:12]


def _dismiss_dialogs(page: Page) -> None:
    for label in ("Allow all cookies", "Close", "Not now", "Not Now"):
        try:
            button = page.get_by_role("button", name=label).first
            if button.is_visible(timeout=800):
                button.click(timeout=1500)
                page.wait_for_timeout(400)
        except Exception:
            pass


def _expand_comments(page: Page, log: Logger, max_clicks: int = 40) -> None:
    """Switch to all comments and keep clicking 'View more comments' / 'replies'."""
    for label in ("Most relevant", "Top comments"):
        try:
            page.get_by_role("button", name=re.compile(label, re.I)).first.click(timeout=2000)
            page.get_by_role("menuitem", name=re.compile("All comments", re.I)).click(timeout=2000)
            page.wait_for_timeout(1500)
            break
        except Exception:
            continue

    pattern = re.compile(r"(View|previous)\s+.*comment|View\s+\d+\s+repl|more compact", re.I)
    for index in range(max_clicks):
        try:
            button = page.get_by_role("button", name=pattern).first
            if not button.is_visible(timeout=1200):
                break
            button.click(timeout=2500)
            page.wait_for_timeout(1200)
        except Exception:
            break
        if index and index % 10 == 0:
            log(f"Expanded comment batches: {index}")


_EXTRACT_JS = """
() => {
  const text = (el) => (el ? el.innerText.trim() : null);
  const posts = Array.from(document.querySelectorAll('div[role="article"]'));
  const root = posts[0] || document.querySelector('div[role="main"]');
  const isProfileLink = (a) => {
    const h = a.getAttribute('href') || '';
    return h && !/comment_id|\\/photo|\\/videos\\/|\\/posts\\/|\\/reel|\\/share|\\/hashtag|\\/watch|\\/help|\\/policies|\\/privacy|\\/business|\\/settings|\\/login|\\/l\\.php|\\/legal|\\/ads|#/.test(h)
      && !a.closest('[role="dialog"], [role="alert"], [role="banner"], [role="navigation"]')
      && (a.innerText || '').trim().length > 1;
  };
  const pickAuthor = (node) => {
    if (!node) return null;
    for (const sel of ['h2 a', 'h3 a', 'h4 a', 'strong a', 'a[role="link"][tabindex="0"]']) {
      const a = Array.from(node.querySelectorAll(sel)).find(isProfileLink);
      if (a) return a;
    }
    return null;
  };
  const authorLink = pickAuthor(root);

  const comments = posts.slice(1).map((node, i) => {
    const a = pickAuthor(node);
    const body = node.querySelector('div[dir="auto"]');
    const time = node.querySelector('a[href*="comment_id"]');
    const depth = node.parentElement && node.parentElement.closest('div[role="article"]') ? 1 : 0;
    return {
      index: i,
      author_name: a ? a.innerText.trim() : null,
      author_url: a ? a.href : null,
      text: body ? body.innerText.trim() : null,
      url: time ? time.href : null,
      depth,
    };
  });

  return {
    author_name: authorLink ? authorLink.innerText.trim() : null,
    author_url: authorLink ? authorLink.href : null,
    post_text: root ? text(root.querySelector('div[data-ad-preview="message"], div[dir="auto"]')) : null,
    page_title: document.title,
    comments,
  };
}
"""

# Only what the profile itself states publicly. No inference of any kind.
_PROFILE_JS = """
() => {
  const main = document.querySelector('div[role="main"]') || document.body;
  const h1 = main.querySelector('h1');
  const all = (main.innerText || '').split('\\n').map(s => s.trim()).filter(Boolean);
  const find = (re) => { const l = all.find(s => re.test(s)); return l || null; };
  let intro = [];
  const introIdx = all.findIndex(s => /^Intro$/i.test(s));
  if (introIdx >= 0) intro = all.slice(introIdx + 1, introIdx + 12);
  const verified = !!main.querySelector('[aria-label*="Verified" i], svg[title*="Verified" i]');
  const og = (p) => (document.querySelector(`meta[property="${p}"]`) || {}).content || null;
  const idMeta = (document.querySelector('meta[property="al:android:url"]') || {}).content || '';
  const idm = idMeta.match(/(?:profile|page)\\/(\\d+)/);
  return {
    display_name: h1 ? h1.innerText.trim() : og('og:title'),
    followers_text: find(/\\bfollowers?\\b/i),
    following_text: find(/\\bfollowing\\b/i),
    likes_text: find(/\\blikes?\\b/i),
    verified,
    intro,
    og_description: og('og:description'),
    platform_id: idm ? idm[1] : null,
    page_url: location.href,
  };
}
"""

# Stated profile lines that touch PDPA-sensitive categories are dropped.
_SENSITIVE = re.compile(
    r"relig|christian|muslim|islam|hindu|buddh|church|mosque|masjid|temple|politic|party|"
    r"born on|birthday|\bage\b|years old|ethnic|race|malay|chinese|indian",
    re.I,
)


def _count(text: str | None) -> int | None:
    if not text:
        return None
    m = re.search(r"([\d.,]+)\s*([KkMm]?)", text)
    if not m:
        return None
    try:
        n = float(m.group(1).replace(",", ""))
    except ValueError:
        return None
    mult = {"k": 1_000, "m": 1_000_000}.get(m.group(2).lower(), 1)
    return int(n * mult)


def _dropped(fields: dict[str, Any], key: str) -> bool:
    cfg = fields.get(key)
    return isinstance(cfg, dict) and cfg.get("keep") is False


def _capture_profile(context: Any, profile_url: str, out_dir: Path, log: Logger,
                     record: Any, fields: dict[str, Any] | None = None) -> dict[str, Any] | None:
    fields = fields or {}
    """Open the author's profile, save a screenshot and the stated public fields."""
    try:
        page = context.new_page()
        page.goto(profile_url, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
        _dismiss_dialogs(page)
        raw = page.evaluate(_PROFILE_JS)
        if not _dropped(fields, "profile_screenshot"):
            png = out_dir / "profile_page.png"
            page.screenshot(path=str(png), full_page=False)
            record(png, "profile_screenshot", "image/png")
        page.close()
    except Exception as exc:
        log(f"Profile capture skipped: {exc}")
        return None
    intro = [s for s in (raw.get("intro") or []) if not _SENSITIVE.search(s)]
    bio = (raw.get("og_description") or "").strip() or None
    if bio and _SENSITIVE.search(bio):
        bio = None
    profile = {
        "display_name": raw.get("display_name"),
        "profile_url": raw.get("page_url") or profile_url,
        "platform_id": raw.get("platform_id"),
        "verified": bool(raw.get("verified")),
        "followers": _count(raw.get("followers_text")),
        "following": _count(raw.get("following_text")),
        "likes": _count(raw.get("likes_text")),
        "bio_verbatim": bio,
        "intro_stated": intro,
    }
    dropped = []
    for key in list(profile):
        if key not in ("display_name", "profile_url") and _dropped(fields, key):
            profile.pop(key)
            dropped.append(f"{key} ({fields[key].get('reason') or 'no reason given'})")
    if dropped:
        log("Profile fields dropped by privacy setting: " + "; ".join(dropped))
    path = out_dir / "profile_stated.json"
    path.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    record(path, "profile_extract", "application/json")
    log(f"Profile captured: {profile['display_name'] or 'unknown name'}")
    return profile


def capture_post(
    url: str,
    options: dict[str, Any],
    log: Logger,
    progress: ProgressReporter | None = None,
) -> dict[str, Any]:
    """Capture one post. Returns parsed data plus a list of local artefact files."""
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir = config.WORK_DIR / f"{stamp}_{post_id_from_url(url)}"
    out_dir.mkdir(parents=True, exist_ok=True)
    artefacts: list[dict[str, Any]] = []

    def record(path: Path, kind: str, mime: str) -> None:
        artefacts.append(
            {
                "path": path,
                "filename": path.name,
                "kind": kind,
                "mime_type": mime,
                "sha256": sha256_file(path),
                "size_bytes": path.stat().st_size,
                "captured_at": utcnow(),
            }
        )

    proxy_url = options.get("proxy_url") or None
    timeout_ms = int(options.get("timeout_seconds") or 180) * 1000

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            **_browser_channel(),
            user_data_dir=str(config.PROFILE_DIR),
            headless=False,  # Facebook is far friendlier to a real window
            viewport={"width": 1280, "height": 1800},
            locale="en-GB",
            **({"proxy": {"server": proxy_url}} if proxy_url else {}),
        )
        page = context.pages[0] if context.pages else context.new_page()
        page.set_default_timeout(min(timeout_ms, 120000))
        log(f"Opening {url}")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
        _dismiss_dialogs(page)
        if progress:
            progress(20, "Facebook post opened")

        if "login" in page.url or page.get_by_role("button", name=re.compile("^Log in$", re.I)).count():
            context.close()
            raise RuntimeError(
                "Chromium is not logged in to Facebook. Run `python -m worker.login` once."
            )

        if options.get("include_replies", True) or options.get("max_comments", 0):
            if progress:
                progress(28, "Expanding comments and replies")
            _expand_comments(page, log)

        body_text = (page.inner_text("body") or "")[:5000]
        for msg in ("having trouble with playing this video", "isn't available at the moment",
                    "This content isn't available", "Video unavailable"):
            if msg.lower() in body_text.lower():
                log(f"WARNING: Facebook showed an error screen: \"{msg}\" — the screenshot shows this notice, not the post")
                break
        data = page.evaluate(_EXTRACT_JS)
        log(f"Parsed post and {len(data.get('comments') or [])} comment nodes")
        if progress:
            progress(45, "Post and comments processed")

        if options.get("live_screenshots", True):
            png = out_dir / "live_post.png"
            page.screenshot(path=str(png), full_page=True)
            record(png, "screenshot", "image/png")
            pdf = out_dir / "live_post.pdf"
            try:
                page.emulate_media(media="screen")
                page.pdf(path=str(pdf), print_background=True, width="1280px")
                record(pdf, "screenshot_pdf", "application/pdf")
            except Exception as exc:  # pdf is Chromium-headless only in some builds
                log(f"PDF skipped: {exc}")

        if progress:
            progress(55, "Screenshot and source files saved")

        html_path = out_dir / "comments_page.html"
        html_path.write_text(page.content(), encoding="utf-8")
        record(html_path, "comments_page_raw", "text/html")

        raw_path = out_dir / "raw_extract.json"
        raw_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        record(raw_path, "raw_extract", "application/json")

        link_path = out_dir / "link.txt"
        link_path.write_text(f"{page.url}\ncaptured_at={utcnow()}\n", encoding="utf-8")
        record(link_path, "link", "text/plain")

        text_path = out_dir / "text_original.txt"
        text_path.write_text(data.get("post_text") or "", encoding="utf-8")
        record(text_path, "text_original", "text/plain")

        final_url = page.url
        data["profile"] = None
        if options.get("capture_profile", True) and data.get("author_url"):
            if progress:
                progress(58, "Capturing author profile")
            data["profile"] = _capture_profile(context, data["author_url"], out_dir, log, record,
                                               options.get("profile_fields") or {})
        context.close()

    if progress:
        progress(62, "Artefacts hashed and ready to upload")

    data["final_url"] = final_url
    data["out_dir"] = out_dir
    data["artefacts"] = artefacts
    return data
