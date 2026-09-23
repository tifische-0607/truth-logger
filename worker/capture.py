"""Facebook capture with a logged-in Chromium profile.

Produces, for one post URL:
  - live_post.png          full-page screenshot of the post (LIVE SCREENSHOT)
  - live_post.pdf          print-to-PDF of the same page
  - comments_page.html     raw DOM of the comments view (raw_extract)
  - link.txt               the permalink, as captured
  - post text + comments   parsed from the DOM

Everything is returned as plain dicts; nothing here talks to the app.
"""

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from playwright.sync_api import Page, sync_playwright

from . import config

Logger = Callable[[str], None]


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def handle_from_url(url: str) -> str:
    m = re.search(r"facebook\.com/(?:profile\.php\?id=(\d+)|groups/[^/]+/(?:posts|permalink)/|([^/?#]+))", url)
    if m:
        return m.group(1) or m.group(3) or "unknown"
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
  const article = document.querySelector('div[role="article"]');
  const posts = Array.from(document.querySelectorAll('div[role="article"]'));
  const root = posts[0] || article;
  const authorLink = root ? root.querySelector('h2 a, h3 a, strong a') : null;

  const comments = posts.slice(1).map((node, i) => {
    const a = node.querySelector('a[href*="/user/"], a[role="link"] span, strong a');
    const body = node.querySelector('div[dir="auto"]');
    const time = node.querySelector('a[href*="comment_id"]');
    const depth = node.closest('div[role="article"] div[role="article"]') ? 1 : 0;
    return {
      index: i,
      author_name: a ? a.innerText.trim() : null,
      author_url: (node.querySelector('a[role="link"]') || {}).href || null,
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


def capture_post(url: str, options: dict[str, Any], log: Logger) -> dict[str, Any]:
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

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(config.PROFILE_DIR),
            headless=False,  # Facebook is far friendlier to a real window
            viewport={"width": 1280, "height": 1800},
            locale="en-GB",
        )
        page = context.pages[0] if context.pages else context.new_page()
        page.set_default_timeout(30000)
        log(f"Opening {url}")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
        _dismiss_dialogs(page)

        if "login" in page.url or page.get_by_role("button", name=re.compile("^Log in$", re.I)).count():
            context.close()
            raise RuntimeError(
                "Chromium is not logged in to Facebook. Run `python -m worker.login` once."
            )

        if options.get("include_replies", True) or options.get("max_comments", 0):
            _expand_comments(page, log)

        data = page.evaluate(_EXTRACT_JS)
        log(f"Parsed post and {len(data.get('comments') or [])} comment nodes")

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
        context.close()

    data["final_url"] = final_url
    data["out_dir"] = out_dir
    data["artefacts"] = artefacts
    return data
