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
HEARTBEAT_SECONDS = int(os.environ.get("HEARTBEAT_SECONDS", "20"))
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "5"))
# How many captures may run at the same time (1-4).
MAX_CONCURRENT = max(1, min(4, int(os.environ.get("MAX_CONCURRENT", "4"))))

import shutil
import threading

_slot = threading.local()
_LOCK_FILES = {"SingletonLock", "SingletonCookie", "SingletonSocket", "lockfile", "LOCK"}


def use_slot(n: int) -> None:
    """Bind this thread to capture slot n. Slot 0 uses the main logged-in
    Chrome profile; other slots get a fresh copy of it (Chrome locks a profile
    to one browser at a time), so every session stays logged in."""
    if n == 0:
        _slot.dir = PROFILE_DIR
        return
    dest = PROFILE_DIR.parent / f"{PROFILE_DIR.name}-slot{n}"
    shutil.rmtree(dest, ignore_errors=True)
    shutil.copytree(
        PROFILE_DIR, dest, symlinks=True,
        ignore=lambda d, names: [x for x in names if x in _LOCK_FILES or x in ("Cache", "Code Cache", "GPUCache", "Service Worker")],
        ignore_dangling_symlinks=True,
    )
    _slot.dir = dest


def profile_dir() -> Path:
    return getattr(_slot, "dir", PROFILE_DIR)

if not BASE_URL or not TOKEN:
    raise SystemExit("WORKER_BASE_URL and WORKER_TOKEN must be set in worker/.env")
