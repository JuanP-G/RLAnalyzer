"""Tests de GET /api/replays/{id}/advanced (cálculo perezoso + persistencia)."""
import pytest

from tests.factories import make_replay, ME

pytestmark = pytest.mark.api


def _frames_for_default_match():
    # default_match (team_size 2): ME+Mate0 (team0), Opp0+Opp1 (team1). ME pegado al balón.
    return {
        "duration": 1.0,
        "players": [
            {"name": ME, "team": 0}, {"name": "Mate0", "team": 0},
            {"name": "Opp0", "team": 1}, {"name": "Opp1", "team": 1},
        ],
        "ball": [[0.0, 0, 0, 100]],
        "cars": [
            [0.0, 0, 0, 50, 17], [0.0, 1, 0, -3000, 17],
            [0.0, 2, 0, 2000, 17], [0.0, 3, 0, 2500, 17],
        ],
    }


def test_advanced_computes_and_persists(client, db, fake_replay_file, monkeypatch):
    r = make_replay(db, team_size=2, my_team=0, file_path=fake_replay_file)
    calls = {"n": 0}

    def fake_gfc(rid, path):
        calls["n"] += 1
        return _frames_for_default_match()
    monkeypatch.setattr("replay_frames.get_frames_cached", fake_gfc)

    out = client.get(f"/api/replays/{r.id}/advanced").json()
    assert out["computed"] is True
    me = next(p for p in out["players"] if p["is_me"])
    assert me["possession_pct"] == 100.0
    assert me["avg_dist_to_goal"] is not None
    assert out["teams"]["0"]["possession_pct"] == 100.0
    assert calls["n"] == 1

    # 2ª llamada → no recalcula (sirve de BD)
    out2 = client.get(f"/api/replays/{r.id}/advanced").json()
    assert out2["computed"] is True
    assert calls["n"] == 1


def test_advanced_no_local_replay(client, db):
    r = make_replay(db, file_path="C:/no/existe.replay")
    out = client.get(f"/api/replays/{r.id}/advanced").json()
    assert out["computed"] is False
    assert out["reason"] == "no_local_replay"


def test_advanced_compute_error(client, db, fake_replay_file, monkeypatch):
    r = make_replay(db, file_path=fake_replay_file)
    def boom(rid, path):
        raise RuntimeError("rrrocket roto")
    monkeypatch.setattr("replay_frames.get_frames_cached", boom)
    out = client.get(f"/api/replays/{r.id}/advanced").json()
    assert out["computed"] is False
    assert out["reason"] == "compute_error"


def test_advanced_404(client):
    assert client.get("/api/replays/99999/advanced").status_code == 404


def test_advanced_status(client, db):
    r1 = make_replay(db)
    make_replay(db)
    s = client.get("/api/stats/advanced/status").json()
    assert s["total"] == 2 and s["computed"] == 0 and s["pending"] == 2
    for p in r1.players:
        p.advanced_computed = True
    db.commit(); db.expire_all()
    s2 = client.get("/api/stats/advanced/status").json()
    assert s2["computed"] == 1 and s2["pending"] == 1
