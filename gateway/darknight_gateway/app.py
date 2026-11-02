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
from .files import HashCache, guess_mime
from .mapping import Collection, Mapping, load_mapping
from .paths import AMBIGUOUS, MISSING, OK, UNSAFE, ManifestReader, compare, resolve


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
        expose_headers=["X-Evidence-SHA256", "X-Evidence-Stored-SHA256", "X-Evidence-Tier",
                        "Content-Disposition"],
        max_age=600,
    )

    manifests = ManifestReader(settings.nas_evidence_root, mapping.manifests)
    root = settings.nas_evidence_root

    def collection_for(hub_id: str) -> tuple[Collection, str]:
        try:
            return mapping.split_id(hub_id)
        except KeyError as exc:
            raise HTTPException(404, "No DarkNight record with that id") from exc

    def file_rows(coll: Collection, raw_id: str) -> list[dict[str, Any]]:
        return db.fetch_all(coll.sql("files"), {"record_id": raw_id})

    def describe_file(coll: Collection, row: dict[str, Any], *, with_hash: bool) -> dict[str, Any]:
        tier = row.get("evidence_tier")
        entry: dict[str, Any] = {
            "file_id": str(row["file_id"]),
            "filename": row.get("filename"),
            "kind": row.get("kind"),
            "mime_type": row.get("mime_type"),
            "size_bytes": row.get("size_bytes"),
            "created_at": row.get("created_at"),
            "sha256_stored": row.get("sha256_stored"),
            "sha256": None,
            "available": False,
            "path_status": None,
            "resolved_path": None,
            "resolved_via": None,
            "baselines": None,
            "evidence_tier": tier,
            "element_crop": mapping.is_element_crop(tier),
            "crop_label": mapping.element_crop_label if mapping.is_element_crop(tier) else None,
        }
        res = resolve(root, row.get("rel_path"), coll, mapping)
        entry["path_status"] = res.status
        if res.status == OK and res.path is not None:
            entry.update(available=True, resolved_path=res.rel_path, resolved_via=res.via)
            entry["size_bytes"] = entry["size_bytes"] or res.path.stat().st_size
            entry["mime_type"] = guess_mime(res.path, entry["mime_type"])
            entry["baselines"] = manifests.baselines(res.path)
            if with_hash:
                entry["sha256"] = hashes.sha256(res.path)
                entry["integrity"] = compare(entry["sha256"], entry["sha256_stored"], entry["baselines"])
        return entry

    def load_record(coll: Collection, raw_id: str) -> dict[str, Any]:
        row = db.fetch_one(coll.sql("record"), {"record_id": raw_id})
        if not row:
            raise HTTPException(404, "No DarkNight record with that id")
        return row

    def hub_row(coll: Collection, row: dict[str, Any]) -> dict[str, Any]:
        out = dict(row)
        out["record_id"] = f"{coll.name}.{row['record_id']}"
        out["collection"] = coll.name
        out["collection_label"] = coll.label
        tier = out.get("evidence_tier")
        out["element_crop"] = mapping.is_element_crop(tier)
        out["crop_label"] = mapping.element_crop_label if out["element_crop"] else None
        return out

    def total_records() -> int:
        total = 0
        for coll in mapping.collections.values():
            row = db.fetch_one(coll.sql("count"), {}) or {}
            total += int(row.get("total") or 0)
        return total

    # ---- health ---------------------------------------------------------------
    @app.get("/health")
    def health() -> dict[str, Any]:
        """Unauthenticated: says only whether the parts are reachable."""
        checks = {"database": False, "nas": root.is_dir()}
        try:
            total_records()
            checks["database"] = True
        except Exception:  # noqa: BLE001
            checks["database"] = False
        return {"ok": all(checks.values()), "version": VERSION, "source_id": mapping.source_id,
                "checks": checks}

    @app.get("/v1/status")
    def status(caller: Caller = Depends(auth)) -> dict[str, Any]:
        per = {}
        for coll in mapping.collections.values():
            row = db.fetch_one(coll.sql("count"), {}) or {}
            per[coll.name] = int(row.get("total") or 0)
        return {"ok": True, "version": VERSION, "source_id": mapping.source_id,
                "records": sum(per.values()), "collections": per,
                "nas_root_available": root.is_dir(), "signed_in_as": caller.handler}

    # ---- search & records -----------------------------------------------------
    @app.get("/v1/search")
    def search(
        q: str | None = Query(None, max_length=200),
        platform: str | None = None,
        item_type: str | None = None,
        collection: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        limit: int = Query(25, ge=1),
        offset: int = Query(0, ge=0),
        caller: Caller = Depends(auth),
    ) -> dict[str, Any]:
        limit = min(limit, settings.max_search_limit)
        if collection and collection not in mapping.collections:
            raise HTTPException(400, "Unknown collection")
        colls = [mapping.collections[collection]] if collection else list(mapping.collections.values())
        params = {"q": (q or "").strip() or None, "platform": platform, "item_type": item_type,
                  "date_from": date_from, "date_to": date_to, "limit": offset + limit + 1, "offset": 0}
        merged: list[dict[str, Any]] = []
        for coll in colls:
            merged += [hub_row(coll, r) for r in db.fetch_all(coll.sql("search"), params)]
        if item_type:
            merged = [r for r in merged if r.get("item_type") == item_type]
        merged.sort(key=lambda r: str(r.get("published_at") or r.get("collected_at") or ""), reverse=True)
        page = merged[offset:offset + limit]
        audit.append("searched", handler=caller.handler, query=q, results=len(page))
        return {"results": page, "next_offset": offset + limit if len(merged) > offset + limit else None}

    @app.get("/v1/records/{record_id}")
    def record(record_id: str, caller: Caller = Depends(auth)) -> dict[str, Any]:
        coll, raw_id = collection_for(record_id)
        row = hub_row(coll, load_record(coll, raw_id))
        row["files"] = [describe_file(coll, f, with_hash=True) for f in file_rows(coll, raw_id)]
        audit.append("accessed", handler=caller.handler, record_id=record_id, what="record")
        return row

    @app.get("/v1/records/{record_id}/files/{file_id}")
    async def file(record_id: str, file_id: str, download: bool = False,
                   caller: Caller = Depends(auth)) -> FileResponse:
        coll, raw_id = collection_for(record_id)
        rows = await run_in_threadpool(file_rows, coll, raw_id)
        match = next((r for r in rows if str(r["file_id"]) == file_id), None)
        if not match:
            raise HTTPException(404, "No such file on this record")
        res = resolve(root, match.get("rel_path"), coll, mapping)
        if res.status == UNSAFE:
            raise HTTPException(403, "File path is outside the evidence share")
        if res.status == AMBIGUOUS:
            raise HTTPException(409, "File path matches more than one file; run reconcile")
        if res.status != OK or res.path is None:
            raise HTTPException(410, "File is missing from the NAS")
        digest = await run_in_threadpool(hashes.sha256, res.path)
        audit.append("accessed", handler=caller.handler, record_id=record_id, file_id=file_id,
                     filename=match.get("filename"), sha256=digest, download=download)
        headers = {"X-Evidence-SHA256": digest, "Cache-Control": "no-store"}
        if match.get("sha256_stored"):
            headers["X-Evidence-Stored-SHA256"] = str(match["sha256_stored"])
        if mapping.is_element_crop(match.get("evidence_tier")):
            headers["X-Evidence-Tier"] = str(match.get("evidence_tier"))
        return FileResponse(
            res.path,
            media_type=guess_mime(res.path, match.get("mime_type")),
            filename=match.get("filename") or res.path.name,
            content_disposition_type="attachment" if download else "inline",
            headers=headers,
        )

    @app.post("/v1/records/{record_id}/rehash")
    def rehash(record_id: str, caller: Caller = Depends(auth)) -> dict[str, Any]:
        coll, raw_id = collection_for(record_id)
        load_record(coll, raw_id)
        results = []
        for row in file_rows(coll, raw_id):
            result: dict[str, Any] = {"file_id": str(row["file_id"]), "filename": row.get("filename"),
                                      "sha256": None, "status": MISSING, "baselines": None}
            res = resolve(root, row.get("rel_path"), coll, mapping)
            if res.status == OK and res.path is not None:
                result["sha256"] = hashes.sha256(res.path, force=True)
                result["baselines"] = manifests.baselines(res.path)
                result["status"] = compare(result["sha256"], row.get("sha256_stored"), result["baselines"])
            elif res.status == AMBIGUOUS:
                result["status"] = AMBIGUOUS
            results.append(result)
            audit.append("re-hashed", handler=caller.handler, record_id=record_id,
                         file_id=result["file_id"], sha256=result["sha256"], status=result["status"])
        return {"record_id": record_id, "results": results}

    @app.get("/v1/records/{record_id}/custody")
    def custody(record_id: str, caller: Caller = Depends(auth)) -> dict[str, Any]:
        return {"record_id": record_id, "entries": audit.entries_for(record_id)}

    return app
