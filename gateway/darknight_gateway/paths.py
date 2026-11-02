"""Finding DarkNight's files on the share, and the hash manifests written beside them.

DarkNight's rows hold paths in mixed formats (relative to different folders, or
absolute under old mount points). `resolve` tries the candidates mapping.yaml
allows and reports what it found. It never guesses by filename and never moves
anything: a path that does not resolve is reported as MISSING, and two different
files for one path as AMBIGUOUS.
"""

from __future__ import annotations

import json
import os
import re
import threading
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any

from .files import UnsafePath, resolve_evidence_path
from .mapping import Collection, Manifests, Mapping

OK, MISSING, AMBIGUOUS, UNSAFE = "OK", "MISSING", "AMBIGUOUS", "UNSAFE"
HEX64 = re.compile(r"^[0-9a-fA-F]{64}$")


@dataclass
class Resolution:
    status: str
    path: Path | None = None
    rel_path: str | None = None          # relative to the share root
    via: str | None = None               # "relative:<base>", "absolute", "legacy:<prefix>"
    tried: list[str] = field(default_factory=list)
    reason: str | None = None


def _candidates(raw: str, collection: Collection, mapping: Mapping, share_root: Path) -> list[tuple[str, str]]:
    """(candidate relative to share root, how) in the order to try them."""
    out: list[tuple[str, str]] = []
    if raw.startswith("/"):
        for legacy in mapping.legacy_prefixes:
            if raw.startswith(legacy.prefix):
                rest = raw[len(legacy.prefix):]
                out += [(str(PurePosixPath(t, rest)) if t else rest, f"legacy:{legacy.prefix}")
                        for t in legacy.to]
                return out
        root = str(share_root).rstrip("/") + "/"
        real_root = str(share_root.resolve()).rstrip("/") + "/"
        for r in (root, real_root):
            if raw.startswith(r):
                return [(raw[len(r):], "absolute")]
        raise UnsafePath("absolute path outside the evidence share")
    for base in collection.path_bases:
        out.append((str(PurePosixPath(base, raw)) if base else raw, f"relative:{base or '.'}"))
    out.append((raw, "relative:share"))
    seen: set[str] = set()
    return [(c, how) for c, how in out if not (c in seen or seen.add(c))]


def resolve(share_root: Path, raw: str | None, collection: Collection, mapping: Mapping) -> Resolution:
    if not raw or "\x00" in raw:
        return Resolution(UNSAFE, reason="empty or invalid path")
    raw = raw.strip()
    if ".." in PurePosixPath(raw).parts:
        return Resolution(UNSAFE, reason="path contains '..'")
    try:
        candidates = _candidates(raw, collection, mapping, share_root)
    except UnsafePath as exc:
        return Resolution(UNSAFE, reason=str(exc))
    found: list[tuple[Path, str, str]] = []
    tried: list[str] = []
    unsafe = 0
    for cand, how in candidates:
        tried.append(cand)
        try:
            full = resolve_evidence_path(share_root, cand)
        except UnsafePath:
            unsafe += 1
            continue
        if full.is_file():
            if not any(os.path.samefile(full, f) for f, _, _ in found):
                found.append((full, cand, how))
    if not found:
        if unsafe == len(candidates):
            return Resolution(UNSAFE, tried=tried, reason="path leaves the evidence share")
        return Resolution(MISSING, tried=tried)
    if len(found) > 1:
        return Resolution(AMBIGUOUS, tried=tried,
                          reason="matches different files: " + "; ".join(c for _, c, _ in found))
    full, cand, how = found[0]
    return Resolution(OK, path=full, rel_path=cand, via=how, tried=tried)


# ---- hash manifests -------------------------------------------------------------------
def _entries(data: Any) -> dict[str, str]:
    """Normalise the manifest shapes we accept into {relative path: sha256}."""
    if isinstance(data, dict):
        for key in ("files", "hashes", "entries", "items"):
            if key in data:
                return _entries(data[key])
        flat = {str(k): str(v) for k, v in data.items() if isinstance(v, str) and HEX64.match(v)}
        if flat:
            return flat
        nested = {}
        for k, v in data.items():
            if isinstance(v, dict):
                sha = v.get("sha256") or v.get("hash")
                if isinstance(sha, str) and HEX64.match(sha):
                    nested[str(k)] = sha
        return nested
    if isinstance(data, list):
        out = {}
        for item in data:
            if not isinstance(item, dict):
                continue
            name = next((item[k] for k in ("path", "relative_path", "file", "filename", "name")
                         if isinstance(item.get(k), str)), None)
            sha = next((item[k] for k in ("sha256", "hash", "sha256_hex", "digest")
                        if isinstance(item.get(k), str)), None)
            if name and sha and HEX64.match(sha.removeprefix("sha256:")):
                out[name] = sha.removeprefix("sha256:")
        return out
    return {}


class ManifestReader:
    """Reads HASHES.sha256.json / HASHES_CASE.sha256.json, cached by mtime."""

    def __init__(self, share_root: Path, manifests: Manifests) -> None:
        self.root = share_root.resolve()
        self.m = manifests
        self._cache: dict[str, tuple[int, dict[str, str]]] = {}
        self._lock = threading.Lock()

    def _load(self, path: Path) -> dict[str, str] | None:
        try:
            mtime = path.stat().st_mtime_ns
        except OSError:
            return None
        key = str(path)
        with self._lock:
            hit = self._cache.get(key)
            if hit and hit[0] == mtime:
                return hit[1]
        try:
            entries = {k.lower(): v.lower() for k, v in _entries(json.loads(path.read_text())).items()}
        except (OSError, ValueError):
            entries = {}
        with self._lock:
            self._cache[key] = (mtime, entries)
        return entries

    @staticmethod
    def _lookup(entries: dict[str, str], rel: str, name: str) -> str | None:
        rel, name = rel.lower(), name.lower()
        for k in (rel, "./" + rel):
            if k in entries:
                return entries[k]
        by_name = [v for k, v in entries.items() if PurePosixPath(k).name == name]
        return by_name[0] if len(by_name) == 1 else None

    def baselines(self, file_path: Path) -> dict[str, Any]:
        out: dict[str, Any] = {"post_manifest": None, "case_manifest": None,
                               "case_manifest_path": None, "timestamped": False}
        post = file_path.parent / self.m.post
        if post.is_file():
            entries = self._load(post) or {}
            out["post_manifest"] = self._lookup(entries, file_path.name, file_path.name)
        folder = file_path.parent
        while folder == self.root or self.root in folder.parents:
            case = folder / self.m.case
            if case.is_file():
                rel = file_path.relative_to(folder).as_posix()
                out["case_manifest"] = self._lookup(self._load(case) or {}, rel, file_path.name)
                out["case_manifest_path"] = case.relative_to(self.root).as_posix()
                stem = case.name.removesuffix(".json")
                out["timestamped"] = any(
                    (folder / (stem + s)).is_file() or (folder / (case.name + s)).is_file()
                    for s in self.m.timestamp_suffixes
                )
                break
            if folder == self.root:
                break
            folder = folder.parent
        return out


def compare(sha: str | None, stored: str | None, baselines: dict[str, Any]) -> str:
    """MATCH if every baseline we have agrees, MISMATCH if any differs."""
    if not sha:
        return MISSING
    known = [b.lower() for b in (stored, baselines.get("post_manifest"), baselines.get("case_manifest")) if b]
    if not known:
        return "NO_BASELINE"
    return "MATCH" if all(b == sha.lower() for b in known) else "MISMATCH"
