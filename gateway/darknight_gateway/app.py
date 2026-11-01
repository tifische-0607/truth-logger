"""DarkNight gateway: read-only HTTP API the Evidence Hub calls from the browser.

It runs on the Mac Studio next to DarkNight, listens on 127.0.0.1 only, and is
published on the tailnet with `tailscale serve`, so it is never on the internet.
See GATEWAY_API.md in the repository root for request and response shapes.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import date
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from .audit import AuditLog
from .auth import Authenticator, Caller
from .config import VERSION, Settings, load_settings
from .db import Database
from .files import HashCache, UnsafePath, guess_mime, resolve_evidence_path
from .mapping import Mapping, load_mapping


def create_app(
    settings: Settings | None = None,
    *,
    database: Database | None = None,
    mapping: Mapping | None = None,
    authenticator: Any = None,
) -> FastAPI:
    settings = settings or load_settings()
    mapping = mapping or load_mapping(settings.mapping_path)
    db = database or Database(settings.database_url)
    hashes = HashCache(settings.state_dir / "hash-cache.sqlite3")
    audit = AuditLog(settings.state_dir / "custody-log.jsonl")
    auth = authenticator or Authenticator(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if hasattr(db, "open"):
            db.open()
        yield
        if hasattr(db, "close"):
            db.close()

    app = FastAPI(title="DarkNight gateway", version=VERSION, lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["X-Evidence-SHA256", "X-Evidence-Stored-SHA256", "Content-Disposition"],
        max_age=600,
    )

    def files_for(record_id: str, *, with_hash: bool) -> list[dict[str, Any]]:
        rows = db.fetch_all(mapping.sql("files"), {"record_id": record_id})
        out = []
        for row in rows:
            entry = {
                "file_id": str(row["file_id"]),
                "filename": row.get("filename"),
                "kind": row.get("kind"),
                "mime_type": row.get("mime_type"),
                "size_bytes": row.get("size_bytes"),
                "created_at": row.get("created_at"),
                "sha256_stored": row.get("sha256_stored"),
                "sha256": None,
                "available": False,
            }
            try:
                path = resolve_evidence_path(settings.nas_evidence_root, str(row["rel_path"]))
                if path.is_file():
                    entry["available"] = True
                    entry["size_bytes"] = entry["size_bytes"] or path.stat().st_size
                    entry["mime_type"] = guess_mime(path, entry["mime_type"])
                    if with_hash:
                        entry["sha256"] = hashes.sha256(path)
            except UnsafePath:
                entry["available"] = False
            out.append(entry)
        return out

    def load_record(record_id: str) -> dict[str, Any]:
        row = db.fetch_one(mapping.sql("record"), {"record_id": record_id})
        if not row:
            raise HTTPException(404, "No DarkNight record with that id")
        return row

    # ---- health ---------------------------------------------------------------
    @app.get("/health")
    def health() -> dict[str, Any]:
        """Unauthenticated: says only whether the parts are reachable."""
        checks = {"database": False, "nas": settings.nas_evidence_root.is_dir()}
        try:
            db.fetch_one(mapping.sql("count"), {})
            checks["database"] = True
        except Exception:  # noqa: BLE001
            checks["database"] = False
        return {"ok": all(checks.values()), "version": VERSION, "source_id": mapping.source_id,
                "checks": checks}

    @app.get("/v1/status")
    def status(caller: Caller = Depends(auth)) -> dict[str, Any]:
        total = db.fetch_one(mapping.sql("count"), {}) or {"total": 0}
        return {"ok": True, "version": VERSION, "source_id": mapping.source_id,
                "records": total.get("total", 0), "nas_root_available": settings.nas_evidence_root.is_dir(),
                "signed_in_as": caller.handler}

    # ---- search & records -----------------------------------------------------
    @app.get("/v1/search")
    def search(
        q: str | None = Query(None, max_length=200),
        platform: str | None = None,
        item_type: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        limit: int = Query(25, ge=1),
        offset: int = Query(0, ge=0),
        caller: Caller = Depends(auth),
    ) -> dict[str, Any]:
        limit = min(limit, settings.max_search_limit)
        rows = db.fetch_all(mapping.sql("search"), {
            "q": (q or "").strip() or None, "platform": platform, "item_type": item_type,
            "date_from": date_from, "date_to": date_to, "limit": limit + 1, "offset": offset,
        })
        audit.append("searched", handler=caller.handler, query=q, results=min(len(rows), limit))
        return {"results": rows[:limit], "next_offset": offset + limit if len(rows) > limit else None}

    @app.get("/v1/records/{record_id}")
    def record(record_id: str, caller: Caller = Depends(auth)) -> dict[str, Any]:
        row = load_record(record_id)
        row["files"] = files_for(record_id, with_hash=True)
        audit.append("accessed", handler=caller.handler, record_id=record_id, what="record")
        return row

    @app.get("/v1/records/{record_id}/files/{file_id}")
    async def file(record_id: str, file_id: str, download: bool = False,
                   caller: Caller = Depends(auth)) -> FileResponse:
        rows = await run_in_threadpool(db.fetch_all, mapping.sql("files"), {"record_id": record_id})
        match = next((r for r in rows if str(r["file_id"]) == file_id), None)
        if not match:
            raise HTTPException(404, "No such file on this record")
        try:
            path = resolve_evidence_path(settings.nas_evidence_root, str(match["rel_path"]))
        except UnsafePath as exc:
            raise HTTPException(403, "File path is outside the evidence share") from exc
        if not path.is_file():
            raise HTTPException(410, "File is missing from the NAS")
        digest = await run_in_threadpool(hashes.sha256, path)
        audit.append("accessed", handler=caller.handler, record_id=record_id, file_id=file_id,
                     filename=match.get("filename"), sha256=digest, download=download)
        headers = {"X-Evidence-SHA256": digest, "Cache-Control": "no-store"}
        if match.get("sha256_stored"):
            headers["X-Evidence-Stored-SHA256"] = str(match["sha256_stored"])
        return FileResponse(
            path,
            media_type=guess_mime(path, match.get("mime_type")),
            filename=match.get("filename") or path.name,
            content_disposition_type="attachment" if download else "inline",
            headers=headers,
        )

    @app.post("/v1/records/{record_id}/rehash")
    def rehash(record_id: str, caller: Caller = Depends(auth)) -> dict[str, Any]:
        load_record(record_id)
        rows = db.fetch_all(mapping.sql("files"), {"record_id": record_id})
        results = []
        for row in rows:
            result = {"file_id": str(row["file_id"]), "filename": row.get("filename"),
                      "sha256": None, "status": "MISSING"}
            try:
                path = resolve_evidence_path(settings.nas_evidence_root, str(row["rel_path"]))
                if path.is_file():
                    result["sha256"] = hashes.sha256(path, force=True)
                    stored = row.get("sha256_stored")
                    result["status"] = (
                        "NO_BASELINE" if not stored else "MATCH" if stored == result["sha256"] else "MISMATCH"
                    )
            except UnsafePath:
                result["status"] = "MISSING"
            results.append(result)
            audit.append("re-hashed", handler=caller.handler, record_id=record_id,
                         file_id=result["file_id"], sha256=result["sha256"], status=result["status"])
        return {"record_id": record_id, "results": results}

    @app.get("/v1/records/{record_id}/custody")
    def custody(record_id: str, caller: Caller = Depends(auth)) -> dict[str, Any]:
        return {"record_id": record_id, "entries": audit.entries_for(record_id)}

    return app
