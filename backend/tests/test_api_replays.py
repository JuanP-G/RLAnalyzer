"""Tests de los endpoints de /api/replays (BD temporal en memoria)."""
from datetime import datetime

import pytest

from tests.factories import make_replay

pytestmark = pytest.mark.api


def test_list_total_and_order(client, db):
    make_replay(db, result="win", played_at=datetime(2026, 5, 1, 20, 0))
    make_replay(db, result="loss", played_at=datetime(2026, 5, 3, 20, 0))
    data = client.get("/api/replays").json()
    assert data["total"] == 2
    # orden por played_at descendente → la del día 3 primero
    assert data["replays"][0]["result"] == "loss"


def test_filter_result(client, db):
    make_replay(db, result="win")
    make_replay(db, result="loss")
    data = client.get("/api/replays?result=win").json()
    assert data["total"] == 1
    assert data["replays"][0]["result"] == "win"   # el devuelto es el correcto


def test_filter_team_size(client, db):
    make_replay(db, team_size=2)
    make_replay(db, team_size=3)
    data = client.get("/api/replays?team_size=3").json()
    assert data["total"] == 1
    assert data["replays"][0]["team_size"] == 3


def test_filter_favorite(client, db):
    make_replay(db, is_favorite=True)
    make_replay(db, is_favorite=False)
    data = client.get("/api/replays?favorite=1").json()
    assert data["total"] == 1
    assert data["replays"][0]["is_favorite"] is True


def test_filter_category(client, db):
    make_replay(db, game_category="Ranked")
    make_replay(db, game_category="Casual")
    data = client.get("/api/replays?game_category=Casual").json()
    assert data["total"] == 1
    assert data["replays"][0]["game_category"] == "Casual"


def test_pagination(client, db):
    for _ in range(5):
        make_replay(db)
    data = client.get("/api/replays?skip=0&limit=2").json()
    assert data["total"] == 5
    assert len(data["replays"]) == 2


def test_get_replay_detail(client, db):
    r = make_replay(db, team_size=2, my_team=0)
    data = client.get(f"/api/replays/{r.id}").json()
    assert "players" in data
    assert {p["team"] for p in data["players"]} == {0, 1}      # ambos equipos
    assert any(p["is_me"] for p in data["players"])
    assert data["game_category"] == "Ranked"                   # regresión BUG-03
    assert data["playlist_id"] == 11


def test_get_replay_404(client):
    assert client.get("/api/replays/99999").status_code == 404


def test_patch_favorite(client, db):
    r = make_replay(db, is_favorite=False)
    resp = client.patch(f"/api/replays/{r.id}/favorite", json={"value": True})
    assert resp.status_code == 200
    assert resp.json()["is_favorite"] is True
    # persiste
    assert client.get(f"/api/replays/{r.id}").json()["is_favorite"] is True


def test_patch_favorite_404(client):
    assert client.patch("/api/replays/99999/favorite", json={"value": True}).status_code == 404


def test_status(client):
    s = client.get("/api/status").json()
    assert s["status"] == "ok"
    assert "player_name" in s
    assert "folder_exists" in s
