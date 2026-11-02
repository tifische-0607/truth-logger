"""Loads mapping.yaml: which DarkNight tables become hub records, and how.

Each collection (findings, comments, profiles, artefacts) has its own SQL. A hub
record id is "<collection>.<row id>", e.g. "finding.418", so ids never collide
across tables.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

REQUIRED_QUERIES = ("count", "search", "record", "files", "paths")

# Columns the gateway relies on. Queries may return more; extra columns are ignored.
REQUIRED_COLUMNS = {
    "count": ["total"],
    "search": ["record_id", "record_code", "platform", "item_type", "published_at"],
    "record": ["record_id", "record_code", "platform", "item_type", "published_at"],
    "files": ["file_id", "filename", "rel_path", "sha256_stored"],
    "paths": ["record_id", "file_id", "rel_path", "sha256_stored"],
}


class MappingError(ValueError):
    pass


@dataclass(frozen=True)
class Query:
    name: str
    sql: str
    returns: list[str]


@dataclass(frozen=True)
class Collection:
    name: str
    label: str
    path_bases: list[str]
    queries: dict[str, Query]

    def sql(self, name: str) -> str:
        return self.queries[name].sql


@dataclass(frozen=True)
class LegacyPrefix:
    prefix: str
    to: list[str]


@dataclass(frozen=True)
class Manifests:
    post: str = "HASHES.sha256.json"
    case: str = "HASHES_CASE.sha256.json"
    timestamp_suffixes: list[str] = field(default_factory=lambda: [".tsr"])


@dataclass(frozen=True)
class Mapping:
    source_id: str
    darknight_root: str
    collections: dict[str, Collection]
    legacy_prefixes: list[LegacyPrefix]
    manifests: Manifests
    element_crop_tiers: list[str]
    element_crop_label: str

    def split_id(self, hub_id: str) -> tuple[Collection, str]:
        """'finding.418' -> (finding collection, '418'). Raises KeyError if unknown."""
        name, sep, raw = hub_id.partition(".")
        if not sep or not raw or name not in self.collections:
            raise KeyError(hub_id)
        return self.collections[name], raw

    def is_element_crop(self, tier: str | None) -> bool:
        return bool(tier) and tier in self.element_crop_tiers


def _query(cname: str, qname: str, raw: dict) -> Query:
    q = raw.get(qname)
    if not q or not q.get("sql"):
        raise MappingError(f"mapping.yaml: {cname}: query '{qname}' is missing")
    returns = list(q.get("returns") or [])
    missing = [c for c in REQUIRED_COLUMNS[qname] if c not in returns]
    if missing:
        raise MappingError(f"mapping.yaml: {cname}: query '{qname}' must return {', '.join(missing)}")
    return Query(name=qname, sql=q["sql"], returns=returns)


def load_mapping(path: Path) -> Mapping:
    data = yaml.safe_load(path.read_text())
    if not isinstance(data, dict):
        raise MappingError(f"{path} is not a mapping document")
    raw_collections = data.get("collections") or {}
    if not raw_collections:
        raise MappingError("mapping.yaml: no collections defined")
    collections: dict[str, Collection] = {}
    for cname, body in raw_collections.items():
        if "." in cname:
            raise MappingError(f"mapping.yaml: collection name '{cname}' may not contain '.'")
        queries = {q: _query(cname, q, body.get("queries") or {}) for q in REQUIRED_QUERIES}
        bases = [str(b).strip("/") for b in (body.get("path_bases") or [""])]
        collections[cname] = Collection(name=cname, label=str(body.get("label") or cname),
                                        path_bases=bases, queries=queries)
    legacy = [
        LegacyPrefix(prefix=str(p["from"]), to=[str(t).strip("/") for t in (p.get("to") or [""])])
        for p in (data.get("legacy_prefixes") or [])
    ]
    m = data.get("manifests") or {}
    manifests = Manifests(
        post=str(m.get("post") or "HASHES.sha256.json"),
        case=str(m.get("case") or "HASHES_CASE.sha256.json"),
        timestamp_suffixes=list(m.get("timestamp_suffixes") or [".tsr"]),
    )
    return Mapping(
        source_id=str(data.get("source_id") or "darknight"),
        darknight_root=str(data.get("darknight_root") or "").strip("/"),
        collections=collections,
        legacy_prefixes=legacy,
        manifests=manifests,
        element_crop_tiers=list(data.get("element_crop_tiers") or []),
        element_crop_label=str(data.get("element_crop_label") or "Element crop"),
    )
