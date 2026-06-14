"""Tests de validación/limpieza de partidas corruptas y endpoint de rechazos."""
import pytest

import events
from models import Replay
from tests.factories import make_replay

pytestmark = pytest.mark.api


@pytest.mark.unit
def test_is_valid_match():
    assert events.is_valid_match({"map_name": "DFH Stadium", "players": [{}, {}]}) is True
    assert events.is_valid_match({"map_name": None, "players": [{}, {}]}) is False   # sin mapa
    assert events.is_valid_match({"map_name": "DFH", "players": [{}]}) is False        # < 2 jugadores
    assert events.is_valid_match({}) is False


def test_delete_invalid_replays(client, db):
    from routers.replays import delete_invalid_replays
    valid = make_replay(db, team_size=2)     # 4 jugadores, con mapa
    invalid = make_replay(db, players=[])    # 0 jugadores → no válida
    removed = delete_invalid_replays(db)
    assert removed == 1
    assert db.get(Replay, invalid.id) is None
    assert db.get(Replay, valid.id) is not None


def test_rejected_endpoint(client):
    events.add_rejected("corrupta_xyz.replay")
    out = client.get("/api/replays/rejected").json()
    assert out["last_seq"] >= 1
    assert any(e["file_name"] == "corrupta_xyz.replay" for e in out["events"])
    # ?since=last_seq → nada nuevo
    assert client.get(f"/api/replays/rejected?since={out['last_seq']}").json()["events"] == []


@pytest.mark.unit
def test_event_types():
    events.add_match_added("DFH Stadium", "win", "3-1")
    events.add_parse_error("ilegible.replay")
    types = {e["type"] for e in events.recent(0)}
    assert events.MATCH_ADDED in types
    assert events.PARSE_ERROR in types
    # cada aviso trae title/body listos para mostrar
    for e in events.recent(0):
        assert e["title"] and e["body"]


def test_notifications_endpoint(client):
    events.add_match_added("Mannfield", "loss", "1-4")
    out = client.get("/api/notifications").json()
    assert out["last_seq"] >= 1
    added = [e for e in out["events"] if e["type"] == events.MATCH_ADDED]
    assert any("Mannfield" in e["body"] for e in added)
    # el feed mezcla tipos; /replays/rejected solo devuelve los corruptos
    events.add_rejected("rota.replay")
    rejected = client.get("/api/replays/rejected").json()["events"]
    assert all(e["type"] == events.CORRUPT for e in rejected)
    # ?since=last_seq → nada nuevo
    seq = client.get("/api/notifications").json()["last_seq"]
    assert client.get(f"/api/notifications?since={seq}").json()["events"] == []
