"""Tests de /api/replays/{id}/frames con mocking (sin rrrocket)."""
import pytest

from tests.factories import make_replay

pytestmark = pytest.mark.api


def test_frames_no_file_path(client, db):
    # Rama replays.py:284 — file_path es None (distinta del 404 por archivo inexistente)
    r = make_replay(db, commit=False)
    r.file_path = None
    db.commit()
    resp = client.get(f"/api/replays/{r.id}/frames")
    assert resp.status_code == 404
    assert "Ruta de archivo" in resp.json()["detail"]


def test_frames_file_missing(client, db):
    # Rama replays.py:286 — file_path existe pero el archivo no está en disco
    r = make_replay(db, file_path="C:/falta.replay")
    assert client.get(f"/api/replays/{r.id}/frames").status_code == 404


def test_frames_ok_mocked(client, db, monkeypatch):
    r = make_replay(db)
    monkeypatch.setattr("os.path.exists", lambda p: True)
    fake = {"format": 2, "duration": 120.0, "players": [], "goals": [], "ball": [], "cars": []}
    import replay_frames
    monkeypatch.setattr(replay_frames, "get_frames_cached", lambda rid, path: fake)
    out = client.get(f"/api/replays/{r.id}/frames").json()
    assert out["duration"] == 120.0


def test_frames_404(client):
    assert client.get("/api/replays/99999/frames").status_code == 404
