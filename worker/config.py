"""Configuration for the Mac mini capture worker."""

import os
import socket
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")


def _path(name: str, default: str) -> Path:
    p = Path(os.environ.get(name, default)).expanduser()
    p.mkdir(parents=True, exist_ok=True)
    return p


BASE_URL = os.environ.get("WORKER_BASE_URL", "").rstrip("/")
TOKEN = os.environ.get("WORKER_TOKEN", "")
PROFILE_DIR = _path("CHROME_PROFILE_DIR", "~/fbem/chrome-profile")
WORK_DIR = _path("WORK_DIR", "~/fbem/captures")
DEFAULT_HANDLER = os.environ.get("DEFAULT_HANDLER", "worker")
VERSION = os.environ.get("WORKER_VERSION", "worker-1.0.0")
HOSTNAME = socket.gethostname()
HEARTBEAT_SECONDS = int(os.environ.get("HEARTBEAT_SECONDS", "60"))
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "5"))

if not BASE_URL or not TOKEN:
    raise SystemExit("WORKER_BASE_URL and WORKER_TOKEN must be set in worker/.env")
