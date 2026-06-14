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
