"""Tests de /api/replays/{id}/frames con mocking (sin rrrocket)."""
import pytest

from factories import make_replay

pytestmark = pytest.mark.api


def test_frames_no_file(client, db):
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
