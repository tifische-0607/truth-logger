"""Watched pages: open a Facebook page/profile or Instagram profile in the
logged-in browser and list the post links currently visible on it. The app
decides which links are new and queues them as normal captures."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse

from playwright.sync_api import sync_playwright

from . import config
from .login import _browser_channel

_LINKS_JS = "() => Array.from(document.querySelectorAll('a[href]')).map(a => a.href)"

_FB_POST = re.compile(r"/(posts|videos|reel)/[^/?#]+|/permalink\.php|/story\.php|/photo(\.php|/)")
_IG_POST = re.compile(r"^/(?:[^/]+/)?(p|reel|tv)/[A-Za-z0-9_-]+")


def normalise(href: str, platform: str) -> str | None:
    try:
        u = urlparse(href)
    except ValueError:
        return None
    host = (u.hostname or "").lower()
    if platform == "instagram":
        if "instagram.com" not in host:
            return None
        m = _IG_POST.match(u.path)
        if not m:
            return None
        return f"https://www.instagram.com/{m.group(1)}/{m.group(0).rstrip('/').split('/')[-1]}/"
    if "facebook.com" not in host or "comment_id" in u.query:
        return None
    if not _FB_POST.search(u.path):
        return None
    if u.path.startswith(("/permalink.php", "/story.php", "/photo.php")):
        q = parse_qs(u.query)
        keep = {k: q[k][0] for k in ("story_fbid", "fbid", "id") if k in q}
        if not keep:
            return None
        return f"https://www.facebook.com{u.path}?{urlencode(keep)}"
    return f"https://www.facebook.com{u.path.rstrip('/')}"


def scan(target: dict[str, Any], log=print) -> list[str]:
    platform = (target.get("platform") or "facebook").lower()
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            **_browser_channel(),
            user_data_dir=str(config.profile_dir()),
            headless=False,
            viewport={"width": 1280, "height": 1800},
            locale="en-GB",
            timezone_id="Asia/Kuala_Lumpur",
        )
        try:
            page = context.pages[0] if context.pages else context.new_page()
            page.goto(target["url"], wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(4000)
            found: list[str] = []
            for _ in range(4):  # newest posts are near the top; a few scrolls is enough
                for href in page.evaluate(_LINKS_JS):
                    n = normalise(href, platform)
                    if n and n not in found:
                        found.append(n)
                page.mouse.wheel(0, 2500)
                page.wait_for_timeout(2000)
            log(f"[watch] {target['url']}: {len(found)} post links visible")
            return found[:50]
        finally:
            context.close()
