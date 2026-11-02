"""Gateway tests.

Path rules, manifests and the custody log run anywhere. The API and reconcile
tests need a throwaway Postgres: set DARKNIGHT_TEST_DSN. They create the four
DarkNight tables in the shape mapping.yaml expects (mobilization, hsdb, ansarian
schemas) and a fake share laid out like the NAS report.

    DARKNIGHT_TEST_DSN=postgresql://postgres@localhost/dn_test pytest gateway/tests
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
from pathlib import Path

import pytest

from darknight_gateway.audit import AuditLog, verify_chain
from darknight_gateway.files import UnsafePath, resolve_evidence_path
from darknight_gateway.mapping import load_mapping
from darknight_gateway.paths import AMBIGUOUS, MISSING, OK, UNSAFE, ManifestReader, compare, resolve

GATEWAY_DIR = Path(__file__).resolve().parent.parent
MAPPING = load_mapping(GATEWAY_DIR / "mapping.yaml")
DN = "300. Projects/Project DarkNight"


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def put(root: Path, rel: str, data: bytes) -> Path:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    return p


# ---- path safety -----------------------------------------------------------------
def test_relative_path_resolves_inside_root(tmp_path: Path) -> None:
    put(tmp_path, "a/f.png", b"x")
    assert resolve_evidence_path(tmp_path, "a/f.png") == (tmp_path / "a" / "f.png").resolve()


def test_absolute_path_under_root_is_accepted(tmp_path: Path) -> None:
    put(tmp_path, "f.png", b"x")
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


# ---- DarkNight path rules ------------------------------------------------------------
def test_mapping_has_the_four_collections() -> None:
    assert set(MAPPING.collections) == {"finding", "comment", "profile", "artifact"}
    assert MAPPING.split_id("finding.418")[1] == "418"
    with pytest.raises(KeyError):
        MAPPING.split_id("418")
    assert MAPPING.is_element_crop("ELEMENT_CROP_V1") and not MAPPING.is_element_crop("FULL_PAGE")


def test_per_collection_bases_and_legacy_prefix(tmp_path: Path) -> None:
    put(tmp_path, f"{DN}/01_Intake/tiktok/1.png", b"a")
    put(tmp_path, f"{DN}/07_UNFILED/old/2.png", b"b")
    finding, artifact = MAPPING.collections["finding"], MAPPING.collections["artifact"]

    r = resolve(tmp_path, "tiktok/1.png", finding, MAPPING)
    assert r.status == OK and r.via == f"relative:{DN}/01_Intake"

    r = resolve(tmp_path, "/Users/hermes/NAS_Friday_Analytics/old/2.png", finding, MAPPING)
    assert r.status == OK and r.rel_path == f"{DN}/07_UNFILED/old/2.png"
    assert r.via == "legacy:/Users/hermes/NAS_Friday_Analytics/"

    r = resolve(tmp_path, f"/Users/hermes/NAS_Ficus1513/Friday_Analytics/{DN}/01_Intake/tiktok/1.png",
                finding, MAPPING)
    assert r.status == OK

    # an artefact path only looks under 07_UNFILED (then the share root)
    assert resolve(tmp_path, "tiktok/1.png", artifact, MAPPING).status == MISSING


def test_no_guessing_and_no_escapes(tmp_path: Path) -> None:
    put(tmp_path, f"{DN}/01_Intake/x/shot.png", b"a")
    comment = MAPPING.collections["comment"]
    # same file name elsewhere is NOT used for a missing path
    assert resolve(tmp_path, "y/shot.png", comment, MAPPING).status == MISSING
    assert resolve(tmp_path, "../../etc/passwd", comment, MAPPING).status == UNSAFE
    assert resolve(tmp_path, "/etc/passwd", comment, MAPPING).status == UNSAFE
    assert resolve(tmp_path, None, comment, MAPPING).status == UNSAFE
    # two different files for one path
    put(tmp_path, f"{DN}/07_UNFILED/x/shot.png", b"different")
    r = resolve(tmp_path, "x/shot.png", comment, MAPPING)
    assert r.status == AMBIGUOUS and "07_UNFILED" in (r.reason or "")


def test_manifests_and_timestamp(tmp_path: Path) -> None:
    f = put(tmp_path, f"{DN}/01_Intake/case1/post9/shot.png", b"img")
    (f.parent / "HASHES.sha256.json").write_text(json.dumps({"files": [
        {"path": "shot.png", "sha256": sha(b"img")}]}))
    case = f.parent.parent
    (case / "HASHES_CASE.sha256.json").write_text(json.dumps({"post9/shot.png": sha(b"img").upper()}))
    reader = ManifestReader(tmp_path, MAPPING.manifests)
    b = reader.baselines(f)
    assert b["post_manifest"] == sha(b"img") and b["case_manifest"] == sha(b"img")
    assert b["case_manifest_path"] == f"{DN}/01_Intake/case1/HASHES_CASE.sha256.json"
    assert b["timestamped"] is False
    (case / "HASHES_CASE.sha256.tsr").write_bytes(b"rfc3161")
    assert reader.baselines(f)["timestamped"] is True
    assert compare(sha(b"img"), None, b) == "MATCH"
    assert compare(sha(b"img"), "0" * 64, b) == "MISMATCH"
    assert compare(sha(b"img"), None, {}) == "NO_BASELINE"


# ---- custody log ---------------------------------------------------------------------
def test_custody_log_chain_detects_edits(tmp_path: Path) -> None:
    path = tmp_path / "log.jsonl"
    log = AuditLog(path)
    log.append("accessed", record_id="1", handler="a")
    log.append("re-hashed", record_id="1", handler="a")
    assert verify_chain(path)[0] is True
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


def build_darknight(share: Path) -> None:
    import psycopg

    shot = put(share, f"{DN}/01_Intake/tiktok/418/shot.png", b"shot 418")
    (shot.parent / "HASHES.sha256.json").write_text(json.dumps({"shot.png": sha(b"shot 418")}))
    (shot.parent.parent / "HASHES_CASE.sha256.json").write_text(
        json.dumps({"files": {"418/shot.png": sha(b"shot 418")}}))
    (shot.parent.parent / "HASHES_CASE.sha256.tsr").write_bytes(b"tsr")
    put(share, f"{DN}/07_UNFILED/old/419.png", b"crop 419")
    put(share, f"{DN}/01_Intake/tiktok/422.png", b"changed")
    put(share, f"{DN}/01_Intake/c/7.png", b"one")
    put(share, f"{DN}/07_UNFILED/c/7.png", b"two")
    put(share, f"{DN}/07_UNFILED/art/doc.pdf", b"%PDF")
    put(share, f"{DN}/07_UNFILED/stray/orphan.png", b"nobody points here")

    with psycopg.connect(DSN, autocommit=True) as conn:
        conn.execute("DROP SCHEMA IF EXISTS mobilization, hsdb, ansarian CASCADE")
        conn.execute("DROP TABLE IF EXISTS finding_files, findings")
        conn.execute("CREATE SCHEMA mobilization; CREATE SCHEMA hsdb; CREATE SCHEMA ansarian")
        conn.execute(
            """CREATE TABLE mobilization.mobilization_findings (
                 id int PRIMARY KEY, platform text, handle text, post_url text,
                 published_at timestamptz, created_at timestamptz DEFAULT now(),
                 text_original text, language text, text_en text, mobilization_type text,
                 location_area text, location_state text, outcome text, evidence_tier text,
                 severity text, confidence numeric, evidence_screenshot_path text, evidence_sha256 text)"""
        )
        conn.execute(
            """INSERT INTO mobilization.mobilization_findings
                 (id, platform, handle, published_at, text_original, text_en, mobilization_type,
                  location_area, location_state, evidence_tier, evidence_screenshot_path, evidence_sha256)
               VALUES
                 (418,'tiktok','test.handle','2026-10-27T14:10Z','perhimpunan hari Jumaat',
                  'gathering on Friday','gathering_only','[Area]','[State]','FULL_PAGE',
                  'tiktok/418/shot.png', %s),
                 (419,'facebook','old.page','2026-10-20T09:00Z','lama',NULL,NULL,NULL,NULL,
                  'ELEMENT_CROP_V1','/Users/hermes/NAS_Friday_Analytics/old/419.png', NULL),
                 (420,'x','gone','2026-10-19T09:00Z','hilang',NULL,NULL,NULL,NULL,NULL,
                  'missing/none.png', NULL),
                 (421,'x','evil','2026-10-18T09:00Z','jahat',NULL,NULL,NULL,NULL,NULL,
                  '../../etc/passwd', NULL),
                 (422,'tiktok','changed','2026-10-17T09:00Z','berubah',NULL,NULL,NULL,NULL,NULL,
                  'tiktok/422.png', %s)""",
            (sha(b"shot 418"), sha(b"original")),
        )
        conn.execute(
            """CREATE TABLE hsdb.comments (id int PRIMARY KEY, platform text, author_handle text,
                 comment_url text, published_at timestamptz, created_at timestamptz DEFAULT now(),
                 text text, text_en text, label text, screenshot_path text)"""
        )
        conn.execute("""INSERT INTO hsdb.comments (id, platform, author_handle, published_at, text, screenshot_path)
                        VALUES (7,'facebook','commenter','2026-10-29T10:00Z','komen Jumaat','c/7.png')""")
        conn.execute(
            """CREATE TABLE hsdb.profiles (id int PRIMARY KEY, platform text, handle text,
                 display_name text, profile_url text, bio text, created_at timestamptz DEFAULT now(),
                 screenshot_path text)"""
        )
        conn.execute("INSERT INTO hsdb.profiles (id, platform, handle, display_name) VALUES (3,'x','prof','Profile Three')")
        conn.execute(
            "CREATE TABLE ansarian.artifact_files (id int PRIMARY KEY, nas_path text, sha256 text, "
            "created_at timestamptz DEFAULT now())"
        )
        conn.execute("INSERT INTO ansarian.artifact_files VALUES (5,'art/doc.pdf',%s,'2026-10-01T00:00Z')",
                     (sha(b"%PDF"),))


@pytest.fixture()
def share(tmp_path: Path) -> Path:
    root = tmp_path / "share"
    build_darknight(root)
    return root


@pytest.fixture()
def settings(tmp_path: Path, share: Path):
    from darknight_gateway.config import Settings

    return Settings(
        database_url=DSN or "", nas_evidence_root=share, mapping_path=GATEWAY_DIR / "mapping.yaml",
        state_dir=tmp_path / "state", supabase_url="", supabase_anon_key="", supabase_jwt_secret="",
        allowed_origins=["https://hub.example"],
    )


@pytest.fixture()
def client(settings):
    from fastapi.testclient import TestClient

    from darknight_gateway.app import create_app
    from darknight_gateway.db import Database

    app = create_app(settings, database=Database(DSN), authenticator=AllowAll())
    with TestClient(app) as c:
        c.state_dir = settings.state_dir  # type: ignore[attr-defined]
        yield c


@needs_db
def test_health_and_status(client) -> None:
    body = client.get("/health").json()
    assert body["ok"] is True and body["checks"] == {"database": True, "nas": True}
    status = client.get("/v1/status").json()
    assert status["collections"] == {"finding": 5, "comment": 1, "profile": 1, "artifact": 1}
    assert status["records"] == 8


@needs_db
def test_search_spans_collections(client) -> None:
    codes = [r["record_code"] for r in client.get("/v1/search", params={"q": "Jumaat"}).json()["results"]]
    assert codes == ["DN-HC-000007", "DN-MF-000418"]  # newest first
    for q in ("gathering", "test.handle"):
        results = client.get("/v1/search", params={"q": q}).json()["results"]
        assert [r["record_id"] for r in results] == ["finding.418"]
    only = client.get("/v1/search", params={"q": "Jumaat", "collection": "comment"}).json()["results"]
    assert [r["record_id"] for r in only] == ["comment.7"]
    page = client.get("/v1/search", params={"limit": 3}).json()
    assert len(page["results"]) == 3 and page["next_offset"] == 3
    assert client.get("/v1/search", params={"collection": "nope"}).status_code == 400


@needs_db
def test_record_files_with_baselines(client) -> None:
    body = client.get("/v1/records/finding.418").json()
    assert body["record_code"] == "DN-MF-000418" and body["location"] == "[Area], [State]"
    assert body["collection"] == "finding" and body["element_crop"] is False
    f = body["files"][0]
    assert f["available"] is True and f["path_status"] == "OK"
    assert f["sha256"] == sha(b"shot 418") and f["integrity"] == "MATCH"
    assert f["baselines"]["post_manifest"] == sha(b"shot 418")
    assert f["baselines"]["case_manifest"] == sha(b"shot 418") and f["baselines"]["timestamped"] is True
    assert client.get("/v1/records/418").status_code == 404
    assert client.get("/v1/records/finding.999").status_code == 404


@needs_db
def test_legacy_path_and_crop_label(client) -> None:
    body = client.get("/v1/records/finding.419").json()
    assert body["element_crop"] is True and "not proof by itself" in body["crop_label"]
    f = body["files"][0]
    assert f["path_status"] == "OK" and f["resolved_via"].startswith("legacy:")
    assert f["element_crop"] is True and f["integrity"] == "NO_BASELINE"
    resp = client.get(f"/v1/records/finding.419/files/{f['file_id']}")
    assert resp.status_code == 200 and resp.headers["x-evidence-tier"] == "ELEMENT_CROP_V1"


@needs_db
def test_file_errors_and_custody(client) -> None:
    resp = client.get("/v1/records/finding.418/files/screenshot")
    assert resp.status_code == 200 and resp.content == b"shot 418"
    assert resp.headers["x-evidence-sha256"] == sha(b"shot 418")
    assert client.get("/v1/records/finding.420/files/screenshot").status_code == 410
    assert client.get("/v1/records/finding.421/files/screenshot").status_code == 403
    assert client.get("/v1/records/comment.7/files/screenshot").status_code == 409
    assert client.get("/v1/records/finding.418/files/nope").status_code == 404
    entries = client.get("/v1/records/finding.418/custody").json()["entries"]
    assert any(e["action"] == "accessed" and e.get("file_id") == "screenshot" for e in entries)
    assert verify_chain(client.state_dir / "custody-log.jsonl")[0] is True


@needs_db
def test_rehash_statuses(client) -> None:
    def status(rid: str) -> list[str]:
        return [r["status"] for r in client.post(f"/v1/records/{rid}/rehash").json()["results"]]

    assert status("finding.418") == ["MATCH"]
    assert status("finding.422") == ["MISMATCH"]
    assert status("finding.420") == ["MISSING"]
    assert status("comment.7") == ["AMBIGUOUS"]
    assert status("artifact.5") == ["MATCH"]
    assert status("profile.3") == []


@needs_db
def test_reconcile_reports_without_changing_anything(settings, share, monkeypatch, capsys) -> None:
    from darknight_gateway import __main__ as cli

    before = sorted((p.as_posix(), p.stat().st_mtime_ns) for p in share.rglob("*"))
    out = settings.state_dir / "r.csv"
    assert cli.cmd_reconcile(settings, ["--out", str(out), "--orphans"]) == 0
    rows = list(csv.DictReader(out.open()))
    by_id = {r["record_id"]: r for r in rows if r["record_id"]}
    assert by_id["finding.418"]["status"] == "OK" and by_id["finding.418"]["timestamped"] == "yes"
    assert by_id["finding.419"]["resolved_via"].startswith("legacy:")
    assert by_id["finding.420"]["status"] == "MISSING"
    assert by_id["finding.421"]["status"] == "UNSAFE"
    assert by_id["comment.7"]["status"] == "AMBIGUOUS"
    orphans = [r["resolved_path"] for r in rows if r["status"] == "ORPHAN"]
    assert f"{DN}/07_UNFILED/stray/orphan.png" in orphans
    assert not any(o.endswith(("HASHES.sha256.json", "HASHES_CASE.sha256.json")) for o in orphans)
    assert "nothing was changed" in capsys.readouterr().out
    assert sorted((p.as_posix(), p.stat().st_mtime_ns) for p in share.rglob("*")) == before


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
