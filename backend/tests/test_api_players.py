"""Tests de /api/players (BD temporal en memoria)."""
import pytest

from factories import make_replay, make_player, ME

pytestmark = pytest.mark.api


def _match_with(db, mate_name, *, together, result="win", my_team=0):
    other = 1 - my_team
    mate_team = my_team if together else other
    players = [
        make_player(ME, my_team, is_me=True, goals=2),
        make_player(mate_name, mate_team, goals=1),
    ]
    return make_replay(db, team_size=2, result=result, my_team=my_team, players=players)


def test_list_players_excludes_me(client, db):
    _match_with(db, "Bob", together=True)
    names = [p["name"] for p in client.get("/api/players").json()["players"]]
    assert "Bob" in names
    assert ME not in names


def test_player_summary_with_and_against(client, db):
    _match_with(db, "Bob", together=True, result="win")
    _match_with(db, "Bob", together=False, result="loss")
    s = client.get("/api/players/Bob/summary").json()
    assert s["total_games"] == 2
    assert s["with"]["games"] == 1 and s["with"]["wins"] == 1
    assert s["against"]["games"] == 1 and s["against"]["losses"] == 1


def test_player_summary_unknown(client):
    s = client.get("/api/players/Nadie/summary").json()
    assert s["total_games"] == 0
    assert s["with"] is None
    assert s["against"] is None


def test_player_replays_context(client, db):
    _match_with(db, "Bob", together=True, result="win")
    _match_with(db, "Bob", together=False, result="loss")
    out = client.get("/api/players/Bob/replays?context=with").json()
    assert out["total"] == 1
    assert out["replays"][0]["context"] == "with"
