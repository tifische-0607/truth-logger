"""Gateway tests.

Path safety and the custody log run anywhere. The API tests need a throwaway
Postgres: set DARKNIGHT_TEST_DSN (they create and fill `findings` and
`finding_files` tables shaped like the placeholder mapping.yaml).

    DARKNIGHT_TEST_DSN=postgresql://postgres@localhost/dn_test pytest gateway/tests
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import pytest

from darknight_gateway.audit import AuditLog, verify_chain
from darknight_gateway.files import UnsafePath, resolve_evidence_path

GATEWAY_DIR = Path(__file__).resolve().parent.parent


# ---- path safety -----------------------------------------------------------------
def test_relative_path_resolves_inside_root(tmp_path: Path) -> None:
    (tmp_path / "a").mkdir()
    (tmp_path / "a" / "f.png").write_bytes(b"x")
    assert resolve_evidence_path(tmp_path, "a/f.png") == (tmp_path / "a" / "f.png").resolve()


def test_absolute_path_under_root_is_accepted(tmp_path: Path) -> None:
    (tmp_path / "f.png").write_bytes(b"x")
    assert resolve_evidence_path(tmp_path, str(tmp_path / "f.png")).name == "f.png"


@pytest.mark.parametrize("bad", ["../etc/passwd", "a/../../x", "/etc/passwd", "", "a\x00b"])
def test_escapes_are_refused(tmp_path: Path, bad: str) -> None:
    with pytest.raises(UnsafePath):
        resolve_evidence_path(tmp_path, bad)


def test_symlink_out_of_root_is_refused(tmp_path: Path) -> None:
    root = tmp_path / "root"
    root.mkdir()
    outside = tmp_path / "secret.txt"
    outside.write_text("no")
    (root / "link.txt").symlink_to(outside)
    with pytest.raises(UnsafePath):
        resolve_evidence_path(root, "link.txt")


# ---- custody log ---------------------------------------------------------------------
def test_custody_log_chain_detects_edits(tmp_path: Path) -> None:
    path = tmp_path / "log.jsonl"
    log = AuditLog(path)
    log.append("accessed", record_id="1", handler="a")
    log.append("re-hashed", record_id="1", handler="a")
    assert verify_chain(path)[0] is True
    # reopening continues the same chain
    AuditLog(path).append("accessed", record_id="2", handler="b")
    assert verify_chain(path) == (True, 3, "chain intact")
    lines = path.read_text().splitlines()
    tampered = json.loads(lines[0])
    tampered["handler"] = "someone else"
    lines[0] = json.dumps(tampered, sort_keys=True)
    path.write_text("\n".join(lines) + "\n")
    ok, _, message = verify_chain(path)
    assert ok is False and "line 2" in message


# ---- API against a throwaway database ---------------------------------------------------
DSN = os.environ.get("DARKNIGHT_TEST_DSN")
needs_db = pytest.mark.skipif(not DSN, reason="set DARKNIGHT_TEST_DSN to run API tests")


class AllowAll:
    def __call__(self):  # FastAPI dependency
        from darknight_gateway.auth import Caller

        return Caller(user_id="u1", email="analyst@example.org", token="t")


@pytest.fixture()
def client(tmp_path: Path):
    import psycopg
    from fastapi.testclient import TestClient

    from darknight_gateway.app import create_app
    from darknight_gateway.config import Settings
    from darknight_gateway.db import Database

    nas = tmp_path / "nas"
    (nas / "tiktok" / "418").mkdir(parents=True)
    video = nas / "tiktok" / "418" / "recording.mp4"
    video.write_bytes(b"fake video bytes")
    shot = nas / "tiktok" / "418" / "frame_0012.png"
    shot.write_bytes(b"fake png bytes")
    good = hashlib.sha256(b"fake video bytes").hexdigest()

    with psycopg.connect(DSN, autocommit=True) as conn:
        conn.execute("DROP TABLE IF EXISTS finding_files, findings")
        conn.execute(
            """CREATE TABLE findings (
                 id serial PRIMARY KEY, platform text, item_type text, handle text,
                 profile_url text, post_url text, published_at timestamptz,
                 collected_at timestamptz, collected_by text, text_original text,
                 language text, text_en text, translator text, classification text,
                 location_area text, location_state text, outcome text,
                 severity text, confidence numeric)"""
        )
        conn.execute(
            """CREATE TABLE finding_files (
                 id serial PRIMARY KEY, finding_id int REFERENCES findings(id),
                 filename text, kind text, mime_type text, size_bytes bigint,
                 rel_path text, sha256 text, created_at timestamptz DEFAULT now())"""
        )
        conn.execute("SELECT setval('findings_id_seq', 417)")
        conn.execute(
            """INSERT INTO findings (platform, item_type, handle, published_at, collected_at,
                 text_original, text_en, classification, location_area, location_state, confidence)
               VALUES ('tiktok','video','test.handle','2026-10-27T14:10Z','2026-10-28T01:31Z',
                 'perhimpunan hari Jumaat', 'gathering on Friday', 'gathering_only', '[Area]', '[State]', 0.7)"""
        )
        conn.execute(
            """INSERT INTO finding_files (finding_id, filename, kind, mime_type, rel_path, sha256)
               VALUES (418,'recording.mp4','video','video/mp4','tiktok/418/recording.mp4', %s),
                      (418,'frame_0012.png','screenshot',NULL,%s, %s),
                      (418,'gone.png','screenshot',NULL,'tiktok/418/gone.png', NULL),
                      (418,'evil.png','screenshot',NULL,'../../etc/passwd', NULL)""",
            (good, str(shot), "0" * 64),
        )

    settings = Settings(
        database_url=DSN, nas_evidence_root=nas, mapping_path=GATEWAY_DIR / "mapping.yaml",
        state_dir=tmp_path / "state", supabase_url="", supabase_anon_key="", supabase_jwt_secret="",
        allowed_origins=["https://hub.example"],
    )
    app = create_app(settings, database=Database(DSN), authenticator=AllowAll())
    with TestClient(app) as c:
        c.state_dir = settings.state_dir  # type: ignore[attr-defined]
        yield c


@needs_db
def test_health(client) -> None:
    body = client.get("/health").json()
    assert body["ok"] is True and body["checks"] == {"database": True, "nas": True}


@needs_db
def test_search_matches_original_and_english(client) -> None:
    for q in ("Jumaat", "gathering", "test.handle"):
        results = client.get("/v1/search", params={"q": q}).json()["results"]
        assert [r["record_code"] for r in results] == ["DN-TI-00418"]
    assert client.get("/v1/search", params={"q": "nothing-like-this"}).json()["results"] == []
    assert client.get("/v1/search", params={"platform": "facebook"}).json()["results"] == []


@needs_db
def test_record_lists_files_with_hashes(client) -> None:
    body = client.get("/v1/records/418").json()
    assert body["record_code"] == "DN-TI-00418" and body["location"] == "[Area], [State]"
    files = {f["filename"]: f for f in body["files"]}
    assert files["recording.mp4"]["sha256"] == hashlib.sha256(b"fake video bytes").hexdigest()
    assert files["recording.mp4"]["available"] is True
    assert files["gone.png"]["available"] is False
    assert files["evil.png"]["available"] is False
    assert client.get("/v1/records/999").status_code == 404


@needs_db
def test_file_stream_carries_hash_and_is_logged(client) -> None:
    record = client.get("/v1/records/418").json()
    video = next(f for f in record["files"] if f["filename"] == "recording.mp4")
    resp = client.get(f"/v1/records/418/files/{video['file_id']}")
    assert resp.status_code == 200 and resp.content == b"fake video bytes"
    assert resp.headers["x-evidence-sha256"] == video["sha256"]
    assert resp.headers["content-type"].startswith("video/mp4")
    evil = next(f for f in record["files"] if f["filename"] == "evil.png")
    assert client.get(f"/v1/records/418/files/{evil['file_id']}").status_code == 403
    gone = next(f for f in record["files"] if f["filename"] == "gone.png")
    assert client.get(f"/v1/records/418/files/{gone['file_id']}").status_code == 410
    entries = client.get("/v1/records/418/custody").json()["entries"]
    assert any(e["action"] == "accessed" and e.get("file_id") == video["file_id"] for e in entries)
    assert verify_chain(client.state_dir / "custody-log.jsonl")[0] is True


@needs_db
def test_rehash_compares_with_stored_hashes(client) -> None:
    results = {r["filename"]: r["status"] for r in client.post("/v1/records/418/rehash").json()["results"]}
    assert results == {"recording.mp4": "MATCH", "frame_0012.png": "MISMATCH",
                       "gone.png": "MISSING", "evil.png": "MISSING"}


@needs_db
def test_cors_only_for_the_hub(client) -> None:
    ok = client.options("/v1/search", headers={"Origin": "https://hub.example",
                                                "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "https://hub.example"
    bad = client.options("/v1/search", headers={"Origin": "https://evil.example",
                                                 "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in bad.headers


def test_unauthenticated_requests_are_refused(tmp_path: Path) -> None:
    from fastapi.testclient import TestClient

    from darknight_gateway.app import create_app
    from darknight_gateway.config import Settings

    class NoDb:
        def fetch_all(self, *a, **k):
            raise AssertionError("must not reach the database")

        def fetch_one(self, *a, **k):
            raise RuntimeError("down")

    settings = Settings(
        database_url="", nas_evidence_root=tmp_path, mapping_path=GATEWAY_DIR / "mapping.yaml",
        state_dir=tmp_path / "state", supabase_url="", supabase_anon_key="",
        supabase_jwt_secret="test-secret", allowed_origins=[],
    )
    with TestClient(create_app(settings, database=NoDb())) as c:
        assert c.get("/v1/search").status_code == 401
        assert c.get("/v1/search", headers={"Authorization": "Bearer nonsense"}).status_code == 401
        assert c.get("/health").json()["checks"]["database"] is False
