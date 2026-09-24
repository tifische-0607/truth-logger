"""Original post/comment timestamps as Facebook shows them.

Facebook shows a short label ("3d", "2 h", "Yesterday at 14:05") and the exact
date only in a hover tooltip. For each item we keep:
  display  – the label exactly as shown on screen
  tooltip  – the exact hover text, when Facebook gave one
  iso      – ISO-8601 time (Asia/Kuala_Lumpur, +08:00)
  basis    – "exact" (from the tooltip) or "approximate" (calculated from the
             label and the capture time) — approximate is never shown as exact
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

from playwright.sync_api import Page

MYT = timezone(timedelta(hours=8))
TIMEZONE_ID = "Asia/Kuala_Lumpur"

# Marks time links with data-fbem-time="post" / "c<index>" and returns their labels.
MARK_JS = """
() => {
  const rel = /^(just now|now|yesterday|\\d+\\s?(s|m|h|d|w|y|sec|secs|min|mins|hr|hrs|hour|hours|day|days|week|weeks|wk|wks|yr|yrs|year|years|mo)\\b)|\\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\b.*\\d/i;
  const pick = (node, pref) => {
    if (!node) return null;
    const links = Array.from(node.querySelectorAll('a[href]'));
    let a = pref ? links.find((l) => pref.test(l.getAttribute('href') || '') && rel.test((l.innerText || '').trim())) : null;
    if (!a) a = links.find((l) => { const t = (l.innerText || l.getAttribute('aria-label') || '').trim(); return t.length < 40 && rel.test(t); });
    return a || null;
  };
  if (/instagram\\.com$/.test(location.hostname)) {
    // Instagram puts the exact time in <time datetime="..."> (hover text = title).
    const t = document.querySelector('main time[datetime], article time[datetime], time[datetime]');
    if (!t) return {};
    t.setAttribute('data-fbem-time', 'post');
    return { post: (t.innerText || '').trim(), post_iso: t.getAttribute('datetime'), post_title: t.getAttribute('title') };
  }
  const arts = Array.from(document.querySelectorAll('div[role="article"]'));
  const root = arts[0] || document.querySelector('div[role="main"]');
  const out = {};
  const post = pick(root, /\\/posts\\/|story_fbid|\\/videos\\/|\\/reel|\\/permalink|\\/photo/);
  if (post) { post.setAttribute('data-fbem-time', 'post'); out.post = (post.innerText || post.getAttribute('aria-label') || '').trim(); }
  arts.slice(1).forEach((node, i) => {
    const a = pick(node, /comment_id/);
    if (a) { a.setAttribute('data-fbem-time', 'c' + i); out['c' + i] = (a.innerText || a.getAttribute('aria-label') || '').trim(); }
  });
  return out;
}
"""

_FORMATS = [
    "%d %B %Y at %H:%M", "%B %d, %Y at %I:%M %p", "%d %B %Y at %I:%M %p", "%B %d, %Y at %H:%M",
    "%d %b %Y at %H:%M", "%b %d, %Y at %I:%M %p", "%d %B %Y", "%B %d, %Y",
]


def parse_exact(text: str) -> Optional[datetime]:
    t = re.sub(r"^[A-Za-z]+,\s*", "", text.strip())  # drop weekday
    t = re.sub(r"\s+", " ", t)
    for fmt in _FORMATS:
        try:
            return datetime.strptime(t, fmt).replace(tzinfo=MYT)
        except ValueError:
            continue
    return None


def parse_relative(label: str, captured: datetime) -> Optional[datetime]:
    s = label.strip().lower()
    if s in ("just now", "now"):
        return captured
    m = re.match(r"yesterday(?: at (\d{1,2}):(\d{2}))?", s)
    if m:
        d = captured - timedelta(days=1)
        return d.replace(hour=int(m.group(1)), minute=int(m.group(2))) if m.group(1) else d
    m = re.match(r"(\d+)\s?([a-z]+)", s)
    if not m:
        return parse_exact(label)
    n, unit = int(m.group(1)), m.group(2)
    table = {"s": 1 / 60, "sec": 1 / 60, "secs": 1 / 60, "m": 1, "min": 1, "mins": 1,
             "h": 60, "hr": 60, "hrs": 60, "hour": 60, "hours": 60,
             "d": 1440, "day": 1440, "days": 1440, "w": 10080, "wk": 10080, "wks": 10080,
             "week": 10080, "weeks": 10080, "mo": 43200,
             "y": 525600, "yr": 525600, "yrs": 525600, "year": 525600, "years": 525600}
    if unit not in table:
        return None
    return captured - timedelta(minutes=n * table[unit])


def read_timestamps(page: Page, log: Callable[[str], None], limit: int = 300) -> dict[str, dict[str, Any]]:
    """Hover each marked time link, read the tooltip, return key -> timestamp record."""
    try:
        labels: dict[str, str] = page.evaluate(MARK_JS) or {}
    except Exception as exc:
        log(f"Timestamp scan failed: {exc}")
        return {}
    captured = datetime.now(MYT)
    out: dict[str, dict[str, Any]] = {}
    if labels.get("post_iso"):
        try:
            when = datetime.fromisoformat(labels["post_iso"].replace("Z", "+00:00")).astimezone(MYT)
            out["post"] = {"display": labels.get("post"), "tooltip": labels.get("post_title") or labels["post_iso"],
                           "iso": when.isoformat(), "basis": "exact", "note": None}
            log(f"Timestamp: Instagram post published {when.isoformat()} (exact)")
            return out
        except ValueError:
            pass
    labels = {k: v for k, v in labels.items() if k in ("post",) or k.startswith("c")}
    for key in list(labels)[:limit]:
        label = labels[key]
        tooltip = None
        try:
            el = page.locator(f'[data-fbem-time="{key}"]').first
            el.scroll_into_view_if_needed(timeout=2000)
            el.hover(timeout=2000)
            page.wait_for_timeout(700)
            tip = page.locator('[role="tooltip"]').last
            if tip.count():
                tooltip = tip.inner_text(timeout=1000).strip() or None
            page.mouse.move(0, 0)
        except Exception:
            pass
        exact = parse_exact(tooltip) if tooltip else None
        approx = None if exact else parse_relative(label, captured)
        when = exact or approx
        out[key] = {
            "display": label,
            "tooltip": tooltip,
            "iso": when.isoformat() if when else None,
            "basis": "exact" if exact else ("approximate" if approx else "unknown"),
            "note": None if exact else (
                f"approximate – calculated from '{label}' and capture time {captured.isoformat()}"
                if approx else "Facebook's time label could not be read"),
        }
    exact_n = sum(1 for v in out.values() if v["basis"] == "exact")
    log(f"Timestamps: {len(out)} found, {exact_n} exact, {len(out) - exact_n} approximate/unknown")
    return out
