"""Tests de /api/settings (BD temporal en memoria)."""
import pytest

from tests.factories import make_replay, ME

pytestmark = pytest.mark.api


def test_get_settings_shape(client, db):
    make_replay(db, team_size=2)   # crea ME + Mate0 + Opp0/Opp1
    s = client.get("/api/settings").json()
    assert "player_name" in s and "replays_folder" in s
    assert "backend_port" in s and "db_path" in s and "timezone" in s   # read-only
    assert "known_players" in s
    assert ME in s["known_players"]


def test_put_player_name_retags_is_me(client, db):
    r = make_replay(db, team_size=2, my_team=0)   # ME is_me=True, Mate0 is_me=False
    resp = client.put("/api/settings", json={"player_name": "Mate0"})
    assert resp.status_code == 200
    assert resp.json()["player_name"] == "Mate0"

    # En producción cada request usa sesión nueva; aquí expiramos para ver el re-tag.
    db.expire_all()
    detail = client.get(f"/api/replays/{r.id}").json()
    by_name = {p["player_name"]: p for p in detail["players"]}
    assert by_name["Mate0"]["is_me"] is True
    assert by_name[ME]["is_me"] is False

    assert client.get("/api/status").json()["player_name"] == "Mate0"


def test_put_player_name_recomputes_result_for_rival(client, db):
    # ME (equipo 0) gana 3-1; Opp0 está en el equipo 1 → para Opp0 es derrota
    r = make_replay(db, team_size=2, my_team=0, result="win", team0_score=3, team1_score=1)
    client.put("/api/settings", json={"player_name": "Opp0"})
    db.expire_all()
    detail = client.get(f"/api/replays/{r.id}").json()
    assert detail["my_team"] == 1
    assert detail["result"] == "loss"
    summary = client.get("/api/stats/summary").json()
    assert summary["wins"] == 0 and summary["losses"] == 1


def test_put_replays_folder(client, db, monkeypatch):
    # No tocar el watcher real en tests
    monkeypatch.setattr("routers.settings._apply_folder_change", lambda: None)
    resp = client.put("/api/settings", json={"replays_folder": "C:/Nueva/Carpeta"})
    assert resp.status_code == 200
    assert resp.json()["replays_folder"] == "C:/Nueva/Carpeta"
    assert client.get("/api/status").json()["replays_folder"] == "C:/Nueva/Carpeta"


def test_put_empty_player_name_400(client):
    assert client.put("/api/settings", json={"player_name": "  "}).status_code == 400


def test_advanced_background_toggle(client):
    assert client.get("/api/settings").json()["advanced_background"] is True   # default
    client.put("/api/settings", json={"advanced_background": False})
    assert client.get("/api/settings").json()["advanced_background"] is False


def test_notify_corrupt_toggle(client):
    assert client.get("/api/settings").json()["notify_corrupt"] is True   # default
    client.put("/api/settings", json={"notify_corrupt": False})
    assert client.get("/api/settings").json()["notify_corrupt"] is False


def test_put_empty_folder_400(client):
    assert client.put("/api/settings", json={"replays_folder": "   "}).status_code == 400
