"""Unitarios de helpers de database.py y players.py (sin BD)."""
from types import SimpleNamespace

import pytest

from database import _playlist_to_category
from routers import players

pytestmark = pytest.mark.unit


def test_playlist_to_category():
    for pid in (10, 11, 13, 34):
        assert _playlist_to_category(pid) == "Ranked"
    for pid in (27, 28, 29, 30):
        assert _playlist_to_category(pid) == "Extra"
    for pid in (0, 6, 99):
        assert _playlist_to_category(pid) == "Casual"
    assert _playlist_to_category(None) is None


def test_players_avg():
    assert players._avg([2, 4]) == 3.0
    assert players._avg([2, None, 4]) == 3.0
    assert players._avg([]) is None


def _ps(**kw):
    base = dict(goals=1, assists=0, saves=1, shots=2, score=300, avg_speed=60.0)
    base.update(kw)
    return SimpleNamespace(**base)


def _rp(result):
    return SimpleNamespace(result=result)


def test_group_stats():
    rows = [
        (_ps(goals=2), _ps(goals=1), _rp("win")),
        (_ps(goals=0), _ps(goals=3), _rp("loss")),
    ]
    out = players._group_stats(rows)
    assert out["games"] == 2
    assert out["wins"] == 1
    assert out["losses"] == 1
    assert out["win_rate"] == 50.0
    assert out["my_avg"]["goals"] == 1.0
    assert out["their_avg"]["goals"] == 2.0


def test_group_stats_ignores_none_their():
    rows = [(_ps(goals=2), None, _rp("win"))]
    out = players._group_stats(rows)
    assert out["their_avg"]["goals"] is None
