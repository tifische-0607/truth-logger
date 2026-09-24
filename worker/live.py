"""Record a Facebook live stream (or any live video page) as it plays.

Produces, for one live URL:
  - live_start.png           screenshot of the live page when recording began (LIVE SCREENSHOT)
  - live_end.png             screenshot when recording stopped
  - live_seg_0000.mp4 ...    the stream itself, cut into fixed-length segments
  - live_recording_log.txt   stream URL, start/stop times (UTC), segment list, tool versions
  - link.txt                 the permalink, as captured

Each segment is a separate artefact with its own SHA-256, so a long recording
never becomes one huge unverifiable file and a failed upload loses one piece only.
The stream is copied as-is (no re-encoding) so the recording is the platform's bytes.

Needs on the Mac mini:  brew install ffmpeg yt-dlp
"""

from __future__ import annotations

import shutil
import signal
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright

from . import config
from .capture import Logger, ProgressReporter, post_id_from_url, sha256_file, utcnow, _dismiss_dialogs

MAX_MINUTES_CAP = 240


def _tool(name: str) -> str:
    path = shutil.which(name) or next(
        (p for p in (f"/opt/homebrew/bin/{name}", f"/usr/local/bin/{name}") if Path(p).exists()), None
    )
    if not path:
        raise RuntimeError(f"{name} is not installed on the Mac mini. Run: brew install ffmpeg yt-dlp")
    return path


def _version(binary: str, flag: str) -> str:
    try:
        out = subprocess.run([binary, flag], capture_output=True, text=True, timeout=15).stdout
        return out.splitlines()[0].strip() if out else "unknown"
    except Exception:
        return "unknown"


def _write_cookies(cookies: list[dict[str, Any]], path: Path) -> None:
    """Netscape cookie file from the logged-in Chromium profile (never uploaded)."""
    lines = ["# Netscape HTTP Cookie File"]
    for c in cookies:
        domain = c.get("domain", "")
        lines.append(
            "\t".join(
                [
                    domain,
                    "TRUE" if domain.startswith(".") else "FALSE",
                    c.get("path", "/"),
                    "TRUE" if c.get("secure") else "FALSE",
                    str(int(c.get("expires") or 0) if (c.get("expires") or 0) > 0 else 0),
                    c.get("name", ""),
                    c.get("value", ""),
                ]
            )
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    path.chmod(0o600)


def record_live(
    url: str,
    options: dict[str, Any],
    log: Logger,
    progress: ProgressReporter | None = None,
) -> dict[str, Any]:
    ffmpeg = _tool("ffmpeg")
    ytdlp = _tool("yt-dlp")

    max_minutes = max(1, min(int(options.get("live_max_minutes") or 30), MAX_MINUTES_CAP))
    segment_seconds = max(15, int(options.get("live_segment_seconds") or 60))
    proxy_url = options.get("proxy_url") or None

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir = config.WORK_DIR / f"{stamp}_LIVE_{post_id_from_url(url)}"
    out_dir.mkdir(parents=True, exist_ok=True)
    cookie_file = config.WORK_DIR / ".live_cookies.txt"  # kept outside out_dir: never evidence
    artefacts: list[dict[str, Any]] = []

    def record(path: Path, kind: str, mime: str, captured_at: str | None = None) -> None:
        artefacts.append(
            {
                "path": path,
                "filename": path.name,
                "kind": kind,
                "mime_type": mime,
                "sha256": sha256_file(path),
                "size_bytes": path.stat().st_size,
                "captured_at": captured_at or utcnow(),
            }
        )

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(config.PROFILE_DIR),
            headless=False,
            viewport={"width": 1280, "height": 1800},
            locale="en-GB",
            **({"proxy": {"server": proxy_url}} if proxy_url else {}),
        )
        page = context.pages[0] if context.pages else context.new_page()
        page.set_default_timeout(120000)
        log(f"Opening live page {url}")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(4000)
        _dismiss_dialogs(page)
        if "login" in page.url:
            context.close()
            raise RuntimeError("Chromium is not logged in to Facebook. Run `python -m worker.login` once.")
        if progress:
            progress(15, "Live page opened")

        start_png = out_dir / "live_start.png"
        page.screenshot(path=str(start_png))
        record(start_png, "screenshot", "image/png")
        _write_cookies(context.cookies(), cookie_file)
        final_url = page.url

        # Resolve the actual stream address with the logged-in cookies.
        cmd = [ytdlp, "--cookies", str(cookie_file), "-f", "best", "-g", final_url]
        if proxy_url:
            cmd[1:1] = ["--proxy", proxy_url]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        stream_url = (res.stdout.strip().splitlines() or [""])[0]
        if res.returncode != 0 or not stream_url:
            context.close()
            cookie_file.unlink(missing_ok=True)
            raise RuntimeError(
                "Could not find a playable live stream on this page. "
                f"yt-dlp said: {(res.stderr or '').strip()[-300:]}"
            )
        log("Live stream found — recording started")

        started_at = utcnow()
        ff = subprocess.Popen(
            [
                ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin",
                "-i", stream_url,
                "-c", "copy", "-map", "0",
                "-t", str(max_minutes * 60),
                "-f", "segment", "-segment_time", str(segment_seconds),
                "-reset_timestamps", "1",
                str(out_dir / "live_seg_%04d.mp4"),
            ],
            stderr=subprocess.PIPE,
            text=True,
        )
        t0 = time.monotonic()
        last_report = 0.0
        stop_reason = "reached maximum length"
        while ff.poll() is None:
            time.sleep(5)
            elapsed = time.monotonic() - t0
            if elapsed - last_report >= 30:
                last_report = elapsed
                done = len(list(out_dir.glob("live_seg_*.mp4")))
                mins = int(elapsed // 60)
                secs = int(elapsed % 60)
                if progress:
                    progress(
                        15 + round(min(elapsed / (max_minutes * 60), 1) * 45),
                        f"Recording live {mins}:{secs:02d} of {max_minutes}:00 ({done} segments)",
                    )
            if elapsed > max_minutes * 60 + 60:  # safety net
                ff.send_signal(signal.SIGINT)
                stop_reason = "stopped by worker safety limit"
                ff.wait(timeout=30)
        err = (ff.stderr.read() if ff.stderr else "").strip()
        stopped_at = utcnow()
        elapsed = time.monotonic() - t0
        if elapsed < max_minutes * 60 - 10:
            stop_reason = "stream ended"
        log(f"Recording stopped ({stop_reason}) after {int(elapsed)}s")
        if err:
            log(f"ffmpeg: {err[-300:]}")

        try:
            end_png = out_dir / "live_end.png"
            page.screenshot(path=str(end_png))
            record(end_png, "screenshot", "image/png")
        except Exception as exc:
            log(f"End screenshot skipped: {exc}")
        title = page.title()
        context.close()
    cookie_file.unlink(missing_ok=True)

    segments = sorted(out_dir.glob("live_seg_*.mp4"))
    segments = [s for s in segments if s.stat().st_size > 0]
    if not segments:
        raise RuntimeError("The live stream produced no video. It may have ended or be restricted.")
    for seg in segments:
        record(seg, "live_video_segment", "video/mp4")

    log_path = out_dir / "live_recording_log.txt"
    log_path.write_text(
        "\n".join(
            [
                f"page_url={url}",
                f"final_url={final_url}",
                f"page_title={title}",
                f"recording_started_utc={started_at}",
                f"recording_stopped_utc={stopped_at}",
                f"duration_seconds={int(elapsed)}",
                f"stop_reason={stop_reason}",
                f"max_minutes={max_minutes}",
                f"segment_seconds={segment_seconds}",
                "method=stream copied without re-encoding (ffmpeg -c copy)",
                f"ffmpeg={_version(ffmpeg, '-version')}",
                f"yt-dlp={_version(ytdlp, '--version')}",
                f"host={config.HOSTNAME}",
                "segments:",
                *[f"  {a['filename']}  sha256={a['sha256']}  bytes={a['size_bytes']}" for a in artefacts if a["kind"] == "live_video_segment"],
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    record(log_path, "live_recording_log", "text/plain")

    link_path = out_dir / "link.txt"
    link_path.write_text(f"{final_url}\ncaptured_at={utcnow()}\n", encoding="utf-8")
    record(link_path, "link", "text/plain")

    if progress:
        progress(62, f"Recorded {len(segments)} video segments, hashed and ready to upload")

    return {
        "final_url": final_url,
        "out_dir": out_dir,
        "artefacts": artefacts,
        "post_text": f"[Live stream recording] {title}",
        "author_name": None,
        "author_url": None,
        "comments": [],
    }
