"""The home custody log: append-only, hash-chained JSON lines.

Every read of a DarkNight record or file through the gateway is written here,
whether or not the record has been linked to a case in the hub. Each line
carries the SHA-256 of the previous line, so any edit or deletion breaks the
chain and `python -m darknight_gateway verify-log` reports where.
"""

from __future__ import annotations

import hashlib
import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

GENESIS = "0" * 64


class AuditLog:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._last = self._read_last_hash()

    def _read_last_hash(self) -> str:
        if not self.path.exists():
            return GENESIS
        last = GENESIS
        with self.path.open("rb") as fh:
            for line in fh:
                if line.strip():
                    last = hashlib.sha256(line.rstrip(b"\n")).hexdigest()
        return last

    def append(self, action: str, **fields: Any) -> dict[str, Any]:
        with self._lock:
            entry = {
                "at": datetime.now(timezone.utc).isoformat(),
                "action": action,
                **fields,
                "prev": self._last,
            }
            line = json.dumps(entry, sort_keys=True, ensure_ascii=False)
            with self.path.open("a", encoding="utf-8") as fh:
                fh.write(line + "\n")
            self._last = hashlib.sha256(line.encode("utf-8")).hexdigest()
            return entry

    def entries_for(self, record_id: str, limit: int = 200) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        out: list[dict[str, Any]] = []
        with self.path.open(encoding="utf-8") as fh:
            for line in fh:
                if not line.strip():
                    continue
                entry = json.loads(line)
                if entry.get("record_id") == record_id:
                    out.append(entry)
        return out[-limit:]


def verify_chain(path: Path) -> tuple[bool, int, str]:
    """Returns (ok, lines_checked, message)."""
    prev = GENESIS
    count = 0
    if not path.exists():
        return True, 0, "no log yet"
    with path.open("rb") as fh:
        for number, raw in enumerate(fh, start=1):
            line = raw.rstrip(b"\n")
            if not line:
                continue
            entry = json.loads(line)
            if entry.get("prev") != prev:
                return False, count, f"chain broken at line {number}"
            prev = hashlib.sha256(line).hexdigest()
            count += 1
    return True, count, "chain intact"
