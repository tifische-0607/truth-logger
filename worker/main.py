"""The Mac mini capture loop.

    python -m worker.main

Sends a heartbeat every minute, claims queued jobs one at a time, captures the
post with a logged-in Chromium, uploads every artefact to the evidence bucket,
ingests the whole record tree and marks the job done or failed.
"""

from __future__ import annotations

import os
import re
import subprocess
import threading
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import api, config

# The launchd service starts with a bare PATH; yt-dlp needs to find Homebrew's ffmpeg.
os.environ["PATH"] = ":".join(
    ["/opt/homebrew/bin", "/usr/local/bin", os.environ.get("PATH", "/usr/bin:/bin")]
)
from .capture import capture_post, handle_from_url, post_id_from_url, utcnow


def _boot_info() -> dict[str, Any]:
    """Machine boot time and uptime on macOS (kern.boottime)."""
    try:
        out = subprocess.check_output(["sysctl", "-n", "kern.boottime"], text=True)
        m = re.search(r"sec = (\d+)", out)
        if not m:
            return {}
        boot = int(m.group(1))
        boot_dt = datetime.fromtimestamp(boot, tz=timezone.utc)
        return {
            "boot_time": boot_dt.isoformat().replace("+00:00", "Z"),
            "uptime_seconds": int(time.time()) - boot,
        }
    except Exception:
        return {}


# Consecutive network failures (heartbeat or claim). If contact with the app is
# lost for a sustained stretch the process exits non-zero so launchd restarts it.
NET_FAILURES = {"count": 0}
NET_FAILURE_LIMIT = int(os.environ.get("NET_FAILURE_LIMIT", "20"))


def _net_ok() -> None:
    NET_FAILURES["count"] = 0


def _net_failed(where: str, exc: Exception) -> None:
    NET_FAILURES["count"] += 1
    print(f"[{where}] {exc} (failure {NET_FAILURES['count']}/{NET_FAILURE_LIMIT})")


PROCESS_STARTED_AT = int(time.time())


def _heartbeat_forever() -> None:
    while True:
        try:
            resp = api.heartbeat(
                {
                    "os": "macOS",
                    "work_dir": str(config.WORK_DIR),
                    "process_started_at": PROCESS_STARTED_AT,
                    **_boot_info(),
                }
            )
            _net_ok()
            if isinstance(resp, dict) and resp.get("restart"):
                # Restart requested from the app. Exit non-zero so launchd
                # relaunches a fresh process (kills any stuck Chromium run).
                print("[restart] Restart requested from the app — exiting for launchd relaunch")
                os._exit(1)
        except Exception as exc:
            _net_failed("heartbeat", exc)
        time.sleep(config.HEARTBEAT_SECONDS)


def _folder(job: dict[str, Any], handle: str, item_code: str) -> str:
    case_id = job.get("case_id") or "UNFILED"
    inc = job.get("incident_id") or "00"
    date = job.get("incident_date") or utcnow()[:10]
    return f"CASE-{case_id}/INC-{inc}_{date}/FB_@{handle}/{item_code}"


def _author_handle(author_url: str | None, fallback_url: str) -> str:
    h = handle_from_url(author_url or "")
    return h if h != "unknown" else handle_from_url(fallback_url)


def _time_fields(ts: dict[str, Any] | None) -> dict[str, Any]:
    """published_at plus how it was obtained (engagement.published_time)."""
    if not ts:
        return {}
    return {
        "published_at": ts.get("iso"),
        "engagement": {"published_time": {k: ts.get(k) for k in ("display", "tooltip", "basis", "note")}},
    }


def _build_records(job: dict[str, Any], data: dict[str, Any], handler: str) -> dict[str, Any]:
    options = job.get("options") or {}
    url = data["final_url"]
    profile = data.get("profile") or {}
    full_name = profile.get("display_name") or data.get("author_name")
    handle = _author_handle(data.get("author_url"), url)
    post_code = f"POST-{post_id_from_url(url)}"
    post_folder = _folder(job, handle, post_code)
    stated = {k: v for k, v in {
        "display_name": full_name,
        "handle": handle if handle != "unknown" else None,
        "profile_url": profile.get("profile_url") or data.get("author_url"),
        "platform_id": profile.get("platform_id"),
        "verified": profile.get("verified"),
        "followers": profile.get("followers"),
        "following": profile.get("following"),
        "likes": profile.get("likes"),
        "bio_verbatim": profile.get("bio_verbatim"),
        "intro_stated": profile.get("intro_stated") or None,
    }.items() if v not in (None, "", [])}

    def artefact_rows(item_folder: str, files: list[dict[str, Any]]) -> list[dict[str, Any]]:
        rows = []
        for a in files:
            rows.append(
                {
                    "filename": a["filename"],
                    "kind": a["kind"],
                    "storage_path": f"{item_folder}/artefacts/{a['filename']}",
                    "sha256": a["sha256"],
                    "size_bytes": a["size_bytes"],
                    "mime_type": a["mime_type"],
                    "captured_at": a["captured_at"],
                }
            )
        return rows

    custody = [
        {
            "filename": a["filename"],
            "sha256": a["sha256"],
            "action": "captured",
            "handler": handler,
            "tool_version": config.VERSION,
            "notes": f"Captured live in Chromium on {config.HOSTNAME}",
        }
        for a in data["artefacts"]
    ]

    post_item = {
        "item_code": post_code,
        "item_type": "post",
        "parent_item_code": None,
        "url": url,
        "platform_item_id": post_id_from_url(url),
        "author_name": full_name,
        "author_handle": handle,
        "author_url": stated.get("profile_url"),
        "text_original": data.get("post_text"),
        **_time_fields(data.get("post_timestamp")),
        "captured_at": utcnow(),
        "folder_path": post_folder,
        "artefacts": artefact_rows(post_folder, data["artefacts"]),
        "custody_events": custody,
        "subject_profile": {
            "subject_type": "poster",
            "stated": stated,
            "observed": {"captured_from": url, "capture_locale": "en-GB",
                         "profile_page_captured": bool(profile)},
            "insufficient_data": not bool(full_name),
        },
    }

    items = [post_item]
    max_comments = int(options.get("max_comments") or 500)
    include_replies = bool(options.get("include_replies", True))
    counter = 0
    reply_counters: dict[str, int] = {}
    last_top_code: str | None = None
    comment_uploads: list[tuple[str, dict[str, Any]]] = []

    for comment in (data.get("comments") or [])[:max_comments]:
        if not (comment.get("text") or comment.get("author_name")):
            continue
        is_reply = bool(comment.get("depth")) and last_top_code is not None
        if is_reply and not include_replies:
            continue
        if is_reply:
            reply_counters[last_top_code] = reply_counters.get(last_top_code, 0) + 1
            code = f"{last_top_code}-R{reply_counters[last_top_code]:02d}"
            parent = last_top_code
            item_type = "reply"
        else:
            counter += 1
            code = f"CMT-{counter:04d}"
            last_top_code = code
            parent = post_code
            item_type = "comment"

        c_handle = handle_from_url(comment.get("author_url") or "")
        c_stated = {k: v for k, v in {
            "display_name": comment.get("author_name"),
            "handle": c_handle if c_handle != "unknown" else None,
            "profile_url": comment.get("author_url"),
        }.items() if v}
        c_folder = f"{_folder(job, handle, post_code)}/comments/{code}"
        c_item: dict[str, Any] = {
            "item_code": code,
            "item_type": item_type,
            "parent_item_code": parent,
            "url": comment.get("url"),
            "author_name": comment.get("author_name"),
            "author_handle": c_handle,
            "author_url": comment.get("author_url"),
            "text_original": comment.get("text"),
            **_time_fields(comment.get("timestamp")),
            "captured_at": utcnow(),
            "folder_path": c_folder,
            "subject_profile": {
                "subject_type": "commenter",
                "stated": c_stated,
                "observed": {},
                "insufficient_data": not bool(comment.get("author_name")),
            },
        }
        shot = comment.get("screenshot")
        if shot:
            shot = {**shot, "filename": (
                f"CASE-{job.get('case_id') or 'UNFILED'}_INC-{job.get('incident_id') or '00'}"
                f"_FB_{code}_{shot.get('stamp', 'capture')}_screenshot.png")}
            comment_uploads.append((f"{c_folder}/artefacts/{shot['filename']}", shot))
            c_item["artefacts"] = artefact_rows(c_folder, [shot])
            c_item["custody_events"] = [{
                "filename": shot["filename"],
                "sha256": shot["sha256"],
                "action": "captured",
                "handler": handler,
                "tool_version": config.VERSION,
                "notes": f"Comment screenshot captured live in Chromium on {config.HOSTNAME}",
            }]
        items.append(c_item)

    case_meta = job.get("case_meta") or {}
    incident_meta = job.get("incident_meta") or {}
    snapshot = {k: v for k, v in {
        "display_name": full_name,
        "followers": profile.get("followers"),
        "following": profile.get("following"),
        "verified": profile.get("verified"),
        "bio_verbatim": profile.get("bio_verbatim"),
    }.items() if v is not None}
    snapshot["captured_at"] = utcnow()
    return {
        "case": {
            "id": job.get("case_id") or "UNFILED",
            "opened_on": job.get("incident_date") or utcnow()[:10],
            "lead_handler": handler,
            **case_meta,
        },
        "incident": {
            "incident_id": job.get("incident_id") or "00",
            "start_date": job.get("incident_date"),
            **incident_meta,
        },
        "account": {
            "platform": "FB",
            "handle": handle,
            "display_name": full_name,
            "profile_url": stated.get("profile_url"),
            "platform_id": profile.get("platform_id"),
        },
        "account_snapshot": snapshot,
        "items": items,
        "_comment_uploads": comment_uploads,
    }


def run_job(job: dict[str, Any]) -> None:
    job_id = job["id"]
    handler = job.get("handler") or config.DEFAULT_HANDLER

    def log(line: str) -> None:
        print(f"[{job_id[:8]}] {line}")
        try:
            api.log(job_id, [line])
        except Exception as exc:
            print(f"[log failed] {exc}")

    def progress(percent: int, stage: str) -> None:
        log(f"PROGRESS:{max(0, min(100, percent))}:{stage}")

    log(f"Claimed job for {job['url']}")
    progress(5, "Preparing capture")
    settings = job.get("settings") or {}
    merged_options: dict[str, Any] = {
        "proxy_url": settings.get("proxy_url"),
        "timeout_seconds": settings.get("timeout_seconds") or 180,
        "expand_comments": settings.get("expand_comments", True),
        "save_pdf": settings.get("save_pdf", True),
        "profile_fields": settings.get("profile_fields") or {},
    }
    merged_options.update(job.get("options") or {})  # per-job options win
    progress(10, "Opening Facebook in Chromium")
    if merged_options.get("mode") == "live":
        from .live import record_live

        data = record_live(job["url"], merged_options, log, progress)
    else:
        data = capture_post(job["url"], {**merged_options, "_job_id": job["id"]}, log, progress)
    log(f"Saved {len(data['artefacts'])} artefacts to {data['out_dir']}")

    # Every capture gets unique filenames so a recapture never collides with
    # (or overwrites) files from an earlier capture of the same post.
    stamp = Path(data["out_dir"]).name.split("_")[0]
    for a in data["artefacts"]:
        a["filename"] = f"{stamp}_{a['filename']}"
    for c in data.get("comments") or []:
        if c.get("screenshot"):
            c["screenshot"]["stamp"] = stamp
    records = _build_records(job, data, handler)
    post_folder = records["items"][0]["folder_path"]
    artefacts = data["artefacts"]
    artefact_count = max(len(artefacts), 1)
    for index, artefact in enumerate(artefacts):
        storage_path = f"{post_folder}/artefacts/{artefact['filename']}"
        payload = Path(artefact["path"]).read_bytes()
        api.upload(storage_path, payload, artefact["mime_type"])
        log(f"Uploaded {artefact['filename']} ({artefact['size_bytes']} bytes)")
        progress(65 + round(((index + 1) / artefact_count) * 20), f"Uploaded {index + 1} of {len(artefacts)} artefacts")

    progress(90, "Writing evidence records")
    log("Writing records to the evidence database")
    result = api.ingest(job_id, records)

    mismatches = [v for v in result.get("verification", []) if v["result"] not in ("MATCH", "RECORDED")]
    if mismatches:
        api.log(job_id, warnings=[f"{v['filename']}: hash {v['result']}" for v in mismatches])

    progress(98, "Final integrity checks complete")
    api.complete(
        job_id,
        "done",
        {
            "item_id": result.get("item_id"),
            "items_captured": len(records["items"]),
            "artefacts": result.get("artefacts_inserted", 0),
            "local_folder": str(data["out_dir"]),
        },
    )
    log("Job complete")


def _run_safely(job: dict[str, Any], slot: int, free: "queue.Queue[int]") -> None:
    try:
        config.use_slot(slot)
        run_job(job)
    except Exception as exc:
        traceback.print_exc()
        try:
            api.log(job["id"], warnings=[str(exc)[:500]])
            api.complete(job["id"], "failed", {"error": str(exc)[:500]})
        except Exception as inner:
            print(f"[complete failed] {inner}")
    finally:
        free.put(slot)


def main() -> None:
    import queue

    threading.Thread(target=_heartbeat_forever, daemon=True).start()
    print(f"Worker {config.VERSION} on {config.HOSTNAME} -> {config.BASE_URL} "
          f"({config.MAX_CONCURRENT} concurrent captures)")
    free: "queue.Queue[int]" = queue.Queue()
    for n in range(config.MAX_CONCURRENT):
        free.put(n)
    while True:
        if NET_FAILURES["count"] >= NET_FAILURE_LIMIT:
            print(f"[net] {NET_FAILURE_LIMIT} consecutive failures — exiting for restart")
            os._exit(1)
        slot = free.get()  # wait for a free capture slot
        try:
            job = api.claim()
            _net_ok()
        except Exception as exc:
            free.put(slot)
            _net_failed("claim", exc)
            time.sleep(config.POLL_SECONDS * 2)
            continue
        if not job:
            free.put(slot)
            time.sleep(config.POLL_SECONDS)
            continue
        print(f"[slot {slot}] starting job {job.get('id')}")
        threading.Thread(target=_run_safely, args=(job, slot, free), daemon=True).start()


if __name__ == "__main__":
    main()
