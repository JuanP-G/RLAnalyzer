"""Tests de GET /api/replays/{id}/advanced (cálculo perezoso + persistencia)."""
import pytest

from tests.factories import make_replay, make_player, ME

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


def test_compute_and_persist_demos(client, db, fake_replay_file, monkeypatch):
    """El backfill de demos empareja por platform_id y persiste inflicted/taken + computed."""
    import sys, types
    players = [
        make_player(ME, team=0, is_me=True, platform_id="pid-me", demos_computed=False, demos_inflicted=None),
        make_player("Opp", team=1, platform_id="pid-opp", demos_computed=False, demos_inflicted=None),
    ]
    r = make_replay(db, players=players, file_path=fake_replay_file)

    fake = types.ModuleType("subtr_actor")
    fake.get_summed_stats = lambda path, module_names=None: {"modules": {"demo": {"player_stats": [
        {"player_id": {"Epic": "pid-me"},  "stats": {"demos_inflicted": 3, "demos_taken": 1}},
        {"player_id": {"Epic": "pid-opp"}, "stats": {"demos_inflicted": 0, "demos_taken": 2}},
    ]}}}
    monkeypatch.setitem(sys.modules, "subtr_actor", fake)

    import main
    assert main.compute_and_persist_demos(db, r) is True
    me = next(p for p in r.players if p.is_me)
    opp = next(p for p in r.players if not p.is_me)
    assert (me.demos_inflicted, me.demos_taken, me.demos_computed) == (3, 1, True)
    assert (opp.demos_inflicted, opp.demos_taken, opp.demos_computed) == (0, 2, True)


def test_shots_endpoint(client, db, fake_replay_file, tmp_path, monkeypatch):
    """/shots: calcula (frames + toques), resuelve nombre por platform_id, cachea y reusa."""
    import sys, types
    players = [make_player(ME, 0, is_me=True, platform_id="pid-me"),
               make_player("Rival", 1, platform_id="pid-op")]
    r = make_replay(db, players=players, file_path=fake_replay_file, my_team=0)

    monkeypatch.setattr("routers.replays._shots_cache_path", lambda rid: str(tmp_path / f"{rid}.json"))
    frames = {"ball": [[10.0, 0, 4000, 100], [10.1, 0, 4200, 100],
                       [10.2, 0, 4400, 100], [10.3, 0, 4600, 100]],
              "goals": [{"team": 0, "time": 10.3}]}
    monkeypatch.setattr("replay_frames.get_frames_cached", lambda rid, path: frames)
    fake = types.ModuleType("subtr_actor")
    fake.get_summed_stats = lambda path, module_names=None: {"modules": {"touch": {"events": [
        {"intention": "shot", "is_team_0": True, "time": 10.0,
         "player": {"Epic": "pid-me"}, "ball_movement": {"end_time": 10.4}},
    ]}}}
    monkeypatch.setitem(sys.modules, "subtr_actor", fake)

    out = client.get(f"/api/replays/{r.id}/shots").json()
    assert out["computed"] is True and out["my_team"] == 0
    assert len(out["shots"]) == 1
    s = out["shots"][0]
    assert s["player"] == ME and s["team"] == 0 and s["outcome"] == "gol"
    assert s["on_target"] is True and s["speed_kmh"] > 0
    # 2ª llamada → desde caché
    assert client.get(f"/api/replays/{r.id}/shots").json()["shots"][0]["player"] == ME


def test_shots_no_local_replay(client, db):
    r = make_replay(db, file_path="C:/no/existe.replay")
    out = client.get(f"/api/replays/{r.id}/shots").json()
    assert out["computed"] is False and out["reason"] == "no_local_replay"


class _FakePS:
    def __init__(self, name, team):
        self.player_name, self.team = name, team
        self.possession_pct = self.avg_dist_to_goal = None
        self.avg_dist_to_teammate = self.time_offensive_half_pct = None
        self.advanced_computed = False


@pytest.mark.unit
def test_assign_unambiguous_by_elimination():
    """Un nombre casa exacto; el otro no casa pero es el único candidato del equipo →
    se asigna por eliminación (es correcto, no hay ambigüedad)."""
    from routers.replays import _assign_advanced_to_stats
    stats = [_FakePS("Alpha", 0), _FakePS("Beta", 0)]
    adv = {"players": {
        0: {"name": "Alpha", "team": 0, "possession_pct": 10.0},
        1: {"name": "GhostName", "team": 0, "possession_pct": 90.0},  # nombre distinto
    }}
    _assign_advanced_to_stats(stats, adv)
    alpha = next(p for p in stats if p.player_name == "Alpha")
    beta = next(p for p in stats if p.player_name == "Beta")
    assert alpha.possession_pct == 10.0
    assert beta.possession_pct == 90.0
    assert all(p.advanced_computed for p in stats)


@pytest.mark.unit
def test_assign_ambiguous_leaves_null_no_swap():
    """Dos compañeros y NINGUNO casa por nombre → ambiguo: se deja NULL antes que
    arriesgar cruzar los valores entre compañeros."""
    from routers.replays import _assign_advanced_to_stats
    stats = [_FakePS("Alpha", 0), _FakePS("Beta", 0)]
    adv = {"players": {
        0: {"name": "Ghost1", "team": 0, "possession_pct": 10.0},
        1: {"name": "Ghost2", "team": 0, "possession_pct": 90.0},
    }}
    _assign_advanced_to_stats(stats, adv)
    assert all(p.possession_pct is None for p in stats)
    assert all(p.advanced_computed for p in stats)   # marcados, no se reintentan


@pytest.mark.unit
def test_assign_anonymous_car_by_order():
    """Coches anónimos (Car_N) sin nombre que cruzar → se asignan por orden."""
    from routers.replays import _assign_advanced_to_stats
    stats = [_FakePS("Alpha", 0), _FakePS("Beta", 0)]
    adv = {"players": {
        0: {"name": "Car_0", "team": 0, "possession_pct": 10.0},
        1: {"name": "Car_1", "team": 0, "possession_pct": 90.0},
    }}
    _assign_advanced_to_stats(stats, adv)
    assert {p.possession_pct for p in stats} == {10.0, 90.0}


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
