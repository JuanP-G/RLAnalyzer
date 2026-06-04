"""Tests de /api/replays/{id}/ballchasing con mocking (sin red ni disco)."""
import pytest

from tests.factories import make_replay

pytestmark = pytest.mark.api


def test_ballchasing_no_file(client, db):
    r = make_replay(db, file_path="C:/no/existe.replay")
    out = client.get(f"/api/replays/{r.id}/ballchasing").json()
    assert out["status"] == "no_file"


def test_ballchasing_cached(client, db, monkeypatch):
    r = make_replay(db)
    monkeypatch.setattr("routers.viewer._load_cache",
                        lambda: {str(r.id): {"url": "http://u", "bc_id": "abc"}})
    out = client.get(f"/api/replays/{r.id}/ballchasing").json()
    assert out["status"] == "cached"
    assert out["bc_id"] == "abc"


def test_ballchasing_no_token(client, db, monkeypatch):
    r = make_replay(db)
    monkeypatch.setattr("routers.viewer._load_cache", lambda: {})
    monkeypatch.setattr("os.path.exists", lambda p: True)
    monkeypatch.setattr("routers.viewer._load_bc_token", lambda: None)
    out = client.get(f"/api/replays/{r.id}/ballchasing").json()
    assert out["status"] == "no_token"


def test_ballchasing_404(client):
    assert client.get("/api/replays/99999/ballchasing").status_code == 404
