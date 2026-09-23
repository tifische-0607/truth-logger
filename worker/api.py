"""Thin client for the six worker endpoints documented in WORKER_API.md."""

from typing import Any, Optional

import requests

from . import config

_session = requests.Session()
_session.headers.update(
    {"Authorization": f"Bearer {config.TOKEN}", "Content-Type": "application/json"}
)


class WorkerApiError(RuntimeError):
    pass


def _post(path: str, body: dict[str, Any], timeout: int = 120) -> dict[str, Any]:
    url = f"{config.BASE_URL}{path}"
    response = _session.post(url, json=body, timeout=timeout)
    try:
        data = response.json()
    except ValueError:
        raise WorkerApiError(f"{path} -> {response.status_code}: {response.text[:300]}")
    if response.status_code >= 400:
        raise WorkerApiError(f"{path} -> {response.status_code}: {data.get('error', data)}")
    return data


def heartbeat(info: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    return _post(
        "/api/public/worker-heartbeat",
        {"version": config.VERSION, "hostname": config.HOSTNAME, "info": info or {}},
        timeout=30,
    )


def claim() -> Optional[dict[str, Any]]:
    return _post("/api/public/worker-claim", {}, timeout=30).get("job")


def log(job_id: str, lines: list[str] | None = None, warnings: list[str] | None = None) -> None:
    if not lines and not warnings:
        return
    _post(
        "/api/public/worker-log",
        {"job_id": job_id, "lines": lines or [], "warnings": warnings or []},
        timeout=30,
    )


def upload(storage_path: str, data: bytes, content_type: str) -> None:
    """Get a signed upload URL and PUT the bytes. Never overwrites."""
    signed = _post(
        "/api/public/worker-upload-url",
        {"path": storage_path, "content_type": content_type},
        timeout=60,
    )
    put = requests.put(
        signed["signed_url"],
        data=data,
        headers={"Content-Type": content_type},
        timeout=300,
    )
    if put.status_code >= 400:
        raise WorkerApiError(f"upload {storage_path} -> {put.status_code}: {put.text[:300]}")


def ingest(job_id: str, records: dict[str, Any]) -> dict[str, Any]:
    return _post("/api/public/worker-ingest", {"job_id": job_id, "records": records}, timeout=600)


def complete(job_id: str, status: str, result: dict[str, Any] | None = None) -> None:
    _post(
        "/api/public/worker-complete",
        {"job_id": job_id, "status": status, "result": result or {}},
        timeout=60,
    )
