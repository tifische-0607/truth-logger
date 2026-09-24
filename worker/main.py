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


def _heartbeat_forever() -> None:
    while True:
        try:
            api.heartbeat(
                {"os": "macOS", "work_dir": str(config.WORK_DIR), **_boot_info()}
            )
            _net_ok()
        except Exception as exc:
            _net_failed("heartbeat", exc)
        time.sleep(config.HEARTBEAT_SECONDS)


def _folder(job: dict[str, Any], handle: str, item_code: str) -> str:
    case_id = job.get("case_id") or "UNFILED"
    inc = job.get("incident_id") or "00"
    date = job.get("incident_date") or utcnow()[:10]
    return f"CASE-{case_id}/INC-{inc}_{date}/FB_@{handle}/{item_code}"


def _build_records(job: dict[str, Any], data: dict[str, Any], handler: str) -> dict[str, Any]:
    options = job.get("options") or {}
    url = data["final_url"]
    handle = handle_from_url(url)
    post_code = f"POST-{post_id_from_url(url)}"
    post_folder = _folder(job, handle, post_code)

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
        "author_name": data.get("author_name"),
        "author_handle": handle,
        "author_url": data.get("author_url"),
        "text_original": data.get("post_text"),
        "captured_at": utcnow(),
        "folder_path": post_folder,
        "artefacts": artefact_rows(post_folder, data["artefacts"]),
        "custody_events": custody,
        "subject_profile": {
            "subject_type": "poster",
            "stated": {"display_name": data.get("author_name"), "profile_url": data.get("author_url")},
            "observed": {"captured_from": url, "capture_locale": "en-GB"},
            "insufficient_data": not bool(data.get("author_name")),
        },
    }

    items = [post_item]
    max_comments = int(options.get("max_comments") or 500)
    include_replies = bool(options.get("include_replies", True))
    counter = 0
    reply_counters: dict[str, int] = {}
    last_top_code: str | None = None

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

        items.append(
            {
                "item_code": code,
                "item_type": item_type,
                "parent_item_code": parent,
                "url": comment.get("url"),
                "author_name": comment.get("author_name"),
                "author_url": comment.get("author_url"),
                "text_original": comment.get("text"),
                "captured_at": utcnow(),
                "folder_path": f"{_folder(job, handle, post_code)}/comments/{code}",
                "subject_profile": {
                    "subject_type": "commenter",
                    "stated": {"display_name": comment.get("author_name")},
                    "observed": {},
                    "insufficient_data": not bool(comment.get("text")),
                },
            }
        )

    case_meta = job.get("case_meta") or {}
    incident_meta = job.get("incident_meta") or {}
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
            "display_name": data.get("author_name"),
            "profile_url": data.get("author_url"),
        },
        "account_snapshot": {
            "display_name": data.get("author_name"),
            "captured_at": utcnow(),
        },
        "items": items,
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

    log(f"Claimed job for {job['url']}")
    settings = job.get("settings") or {}
    merged_options: dict[str, Any] = {
        "proxy_url": settings.get("proxy_url"),
        "timeout_seconds": settings.get("timeout_seconds") or 180,
        "expand_comments": settings.get("expand_comments", True),
        "save_pdf": settings.get("save_pdf", True),
    }
    merged_options.update(job.get("options") or {})  # per-job options win
    data = capture_post(job["url"], merged_options, log)
    log(f"Saved {len(data['artefacts'])} artefacts to {data['out_dir']}")

    records = _build_records(job, data, handler)
    post_folder = records["items"][0]["folder_path"]
    for artefact in data["artefacts"]:
        storage_path = f"{post_folder}/artefacts/{artefact['filename']}"
        payload = Path(artefact["path"]).read_bytes()
        api.upload(storage_path, payload, artefact["mime_type"])
        log(f"Uploaded {artefact['filename']} ({artefact['size_bytes']} bytes)")

    log("Writing records to the evidence database")
    result = api.ingest(job_id, records)

    mismatches = [v for v in result.get("verification", []) if v["result"] not in ("MATCH", "RECORDED")]
    if mismatches:
        api.log(job_id, warnings=[f"{v['filename']}: hash {v['result']}" for v in mismatches])

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


def main() -> None:
    threading.Thread(target=_heartbeat_forever, daemon=True).start()
    print(f"Worker {config.VERSION} on {config.HOSTNAME} -> {config.BASE_URL}")
    while True:
        if NET_FAILURES["count"] >= NET_FAILURE_LIMIT:
            # Lost contact with the app for a sustained stretch. Exit non-zero so
            # launchd (or the shell wrapper) restarts us with a clean state.
            print(f"[net] {NET_FAILURE_LIMIT} consecutive failures — exiting for restart")
            raise SystemExit(1)
        try:
            job = api.claim()
            _net_ok()
        except Exception as exc:
            _net_failed("claim", exc)
            time.sleep(config.POLL_SECONDS * 2)
            continue
        if not job:
            time.sleep(config.POLL_SECONDS)
            continue
        try:
            run_job(job)
        except Exception as exc:
            traceback.print_exc()
            try:
                api.log(job["id"], warnings=[str(exc)[:500]])
                api.complete(job["id"], "failed", {"error": str(exc)[:500]})
            except Exception as inner:
                print(f"[complete failed] {inner}")


if __name__ == "__main__":
    main()
