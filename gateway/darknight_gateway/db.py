"""Read-only access to the DarkNight database."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


def _configure(conn) -> None:
    # Belt and braces: the database user should already be read-only.
    conn.execute("SET default_transaction_read_only = on")
    conn.execute("SET statement_timeout = '15s'")
    conn.commit()


class Database:
    def __init__(self, dsn: str) -> None:
        self.pool = ConnectionPool(
            dsn,
            min_size=0,
            max_size=4,
            kwargs={"row_factory": dict_row, "application_name": "darknight-gateway"},
            configure=_configure,
            open=False,
        )

    def open(self) -> None:
        self.pool.open(wait=False)

    def close(self) -> None:
        self.pool.close()

    def fetch_all(self, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        with self.pool.connection() as conn:
            with conn.transaction():
                conn.execute("SET TRANSACTION READ ONLY")
                rows = conn.execute(sql, params).fetchall()
        return [_jsonable(r) for r in rows]

    def fetch_one(self, sql: str, params: dict[str, Any]) -> dict[str, Any] | None:
        rows = self.fetch_all(sql, params)
        return rows[0] if rows else None


def _jsonable(row: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in row.items():
        if isinstance(value, (datetime, date)):
            out[key] = value.isoformat()
        elif isinstance(value, Decimal):
            out[key] = float(value)
        else:
            out[key] = value
    return out
