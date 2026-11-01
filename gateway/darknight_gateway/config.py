"""Gateway settings, read from the environment (or gateway/.env)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

VERSION = "gateway-0.1.0"


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _list(name: str) -> list[str]:
    return [v.strip() for v in os.environ.get(name, "").split(",") if v.strip()]


@dataclass(frozen=True)
class Settings:
    # DarkNight database, connected as a READ-ONLY user.
    database_url: str
    # Root of the evidence share as mounted on this machine, e.g. /Volumes/Evidence/darknight
    nas_evidence_root: Path
    mapping_path: Path
    # Where the gateway keeps its own state: hash cache and the home custody log.
    state_dir: Path
    # Supabase project of the Evidence Hub, used to check sign-ins.
    supabase_url: str
    supabase_anon_key: str
    # Optional shared secret for HS256-signed tokens; leave empty to use the project's JWKS.
    supabase_jwt_secret: str
    # Browser origins allowed to call the gateway (the hub's published and preview URLs).
    allowed_origins: list[str] = field(default_factory=list)
    host: str = "127.0.0.1"
    port: int = 8787
    max_search_limit: int = 100


def load_settings() -> Settings:
    _load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    base = Path(__file__).resolve().parent.parent
    return Settings(
        database_url=os.environ.get("DARKNIGHT_DATABASE_URL", ""),
        nas_evidence_root=Path(os.environ.get("NAS_EVIDENCE_ROOT", "/Volumes/Evidence/darknight")),
        mapping_path=Path(os.environ.get("GATEWAY_MAPPING", str(base / "mapping.yaml"))),
        state_dir=Path(os.environ.get("GATEWAY_STATE_DIR", str(Path.home() / "darknight-gateway"))),
        supabase_url=os.environ.get("SUPABASE_URL", "").rstrip("/"),
        supabase_anon_key=os.environ.get("SUPABASE_ANON_KEY", ""),
        supabase_jwt_secret=os.environ.get("SUPABASE_JWT_SECRET", ""),
        allowed_origins=_list("GATEWAY_ALLOWED_ORIGINS"),
        host=os.environ.get("GATEWAY_HOST", "127.0.0.1"),
        port=int(os.environ.get("GATEWAY_PORT", "8787")),
    )
