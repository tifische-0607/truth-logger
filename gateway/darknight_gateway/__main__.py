"""Command line: run the gateway, check the mapping, or verify the home custody log.

    python -m darknight_gateway serve       # start (127.0.0.1:8787 by default)
    python -m darknight_gateway check       # run every mapping query once
    python -m darknight_gateway verify-log  # check the custody log's hash chain
"""

from __future__ import annotations

import sys

from .config import load_settings


def main(argv: list[str]) -> int:
    command = argv[1] if len(argv) > 1 else "serve"
    settings = load_settings()

    if command == "serve":
        import uvicorn

        from .app import create_app

        uvicorn.run(create_app(settings), host=settings.host, port=settings.port,
                    proxy_headers=True, forwarded_allow_ips="127.0.0.1")
        return 0

    if command == "check":
        from .db import Database
        from .mapping import load_mapping

        mapping = load_mapping(settings.mapping_path)
        db = Database(settings.database_url)
        db.open()
        ok = True
        samples = {
            "count": {},
            "search": {"q": None, "platform": None, "item_type": None, "date_from": None,
                       "date_to": None, "limit": 1, "offset": 0},
        }
        for name in ("count", "search"):
            try:
                rows = db.fetch_all(mapping.sql(name), samples[name])
                cols = set(rows[0].keys()) if rows else set()
                missing = [c for c in mapping.queries[name].returns if rows and c not in cols]
                print(f"{name}: ok ({len(rows)} row)" + (f", missing {missing}" if missing else ""))
                ok = ok and not missing
                if name == "search" and rows:
                    rid = rows[0]["record_id"]
                    for sub in ("record", "files"):
                        sub_rows = db.fetch_all(mapping.sql(sub), {"record_id": rid})
                        sub_cols = set(sub_rows[0].keys()) if sub_rows else set()
                        sub_missing = [c for c in mapping.queries[sub].returns if sub_rows and c not in sub_cols]
                        print(f"{sub}: ok ({len(sub_rows)} rows for record {rid})"
                              + (f", missing {sub_missing}" if sub_missing else ""))
                        ok = ok and not sub_missing
            except Exception as exc:  # noqa: BLE001
                print(f"{name}: FAILED: {exc}")
                ok = False
        print("NAS evidence root:", settings.nas_evidence_root,
              "found" if settings.nas_evidence_root.is_dir() else "NOT FOUND")
        db.close()
        return 0 if ok else 1

    if command == "verify-log":
        from .audit import verify_chain

        ok, count, message = verify_chain(settings.state_dir / "custody-log.jsonl")
        print(f"{message} ({count} entries)")
        return 0 if ok else 1

    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
