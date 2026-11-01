"""Evidence files on the NAS: safe path resolution and hashing with a cache."""

from __future__ import annotations

import hashlib
import mimetypes
import sqlite3
import threading
from pathlib import Path


class UnsafePath(ValueError):
    pass


def resolve_evidence_path(root: Path, rel_path: str) -> Path:
    """Resolve a path from DarkNight against the evidence root, refusing escapes.

    DarkNight may store absolute paths that start with the root, or paths relative
    to it. Anything that resolves outside the root (../, symlinks out) is refused.
    """
    if not rel_path or "\x00" in rel_path:
        raise UnsafePath("empty or invalid path")
    root_resolved = root.resolve()
    candidate = Path(rel_path)
    if candidate.is_absolute():
        try:
            candidate = candidate.relative_to(root_resolved)
        except ValueError:
            try:
                candidate = candidate.relative_to(root)
            except ValueError as exc:
                raise UnsafePath("absolute path outside the evidence root") from exc
    full = (root_resolved / candidate).resolve()
    if full != root_resolved and root_resolved not in full.parents:
        raise UnsafePath("path escapes the evidence root")
    return full


def guess_mime(path: Path, stored: str | None) -> str:
    if stored:
        return stored
    mime, _ = mimetypes.guess_type(path.name)
    return mime or "application/octet-stream"


class HashCache:
    """SHA-256 per file, cached by (path, size, mtime) so large videos hash once."""

    def __init__(self, db_path: Path) -> None:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS hashes (path TEXT PRIMARY KEY, size INTEGER, "
            "mtime_ns INTEGER, sha256 TEXT, hashed_at TEXT DEFAULT CURRENT_TIMESTAMP)"
        )
        self._conn.commit()

    def sha256(self, path: Path, *, force: bool = False) -> str:
        stat = path.stat()
        key = str(path)
        if not force:
            with self._lock:
                row = self._conn.execute(
                    "SELECT size, mtime_ns, sha256 FROM hashes WHERE path = ?", (key,)
                ).fetchone()
            if row and row[0] == stat.st_size and row[1] == stat.st_mtime_ns:
                return row[2]
        digest = hash_file(path)
        with self._lock:
            self._conn.execute(
                "INSERT INTO hashes(path, size, mtime_ns, sha256) VALUES (?,?,?,?) "
                "ON CONFLICT(path) DO UPDATE SET size=excluded.size, mtime_ns=excluded.mtime_ns, "
                "sha256=excluded.sha256, hashed_at=CURRENT_TIMESTAMP",
                (key, stat.st_size, stat.st_mtime_ns, digest),
            )
            self._conn.commit()
        return digest


def hash_file(path: Path, chunk: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while block := fh.read(chunk):
            h.update(block)
    return h.hexdigest()
