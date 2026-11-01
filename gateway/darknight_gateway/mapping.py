"""Loads mapping.yaml: the SQL that turns DarkNight rows into hub records."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

REQUIRED_QUERIES = ("count", "search", "record", "files")

# Columns the gateway relies on. Queries may return more; extra columns are ignored.
REQUIRED_COLUMNS = {
    "count": ["total"],
    "search": ["record_id", "record_code", "platform", "item_type", "published_at"],
    "record": ["record_id", "record_code", "platform", "item_type", "published_at"],
    "files": ["file_id", "filename", "rel_path"],
}


@dataclass(frozen=True)
class Query:
    name: str
    sql: str
    returns: list[str]


@dataclass(frozen=True)
class Mapping:
    source_id: str
    queries: dict[str, Query]

    def sql(self, name: str) -> str:
        return self.queries[name].sql


class MappingError(ValueError):
    pass


def load_mapping(path: Path) -> Mapping:
    data = yaml.safe_load(path.read_text())
    if not isinstance(data, dict):
        raise MappingError(f"{path} is not a mapping document")
    raw = data.get("queries") or {}
    queries: dict[str, Query] = {}
    for name in REQUIRED_QUERIES:
        q = raw.get(name)
        if not q or not q.get("sql"):
            raise MappingError(f"mapping.yaml: query '{name}' is missing")
        returns = list(q.get("returns") or [])
        missing = [c for c in REQUIRED_COLUMNS[name] if c not in returns]
        if missing:
            raise MappingError(f"mapping.yaml: query '{name}' must return {', '.join(missing)}")
        queries[name] = Query(name=name, sql=q["sql"], returns=returns)
    return Mapping(source_id=str(data.get("source_id") or "darknight"), queries=queries)
