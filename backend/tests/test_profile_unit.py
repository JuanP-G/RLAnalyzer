"""Unitarios del parser de tracker.gg (profile.py), sin red."""
import json
import os

import pytest

from routers import profile

pytestmark = pytest.mark.unit

HERE = os.path.dirname(__file__)


def _sample():
    with open(os.path.join(HERE, "fixtures", "tracker_sample.json"), encoding="utf-8") as f:
        return json.load(f)


def test_first():
    assert profile._first(None, 0, 5) == 0      # 0 es válido
    assert profile._first(None, None) is None
    assert profile._first(7) == 7


def test_parse_uses_rating_percentile_and_rank():
    out = profile._parse(_sample())
    pls = {p["name"]: p for p in out["playlists"]}

    duel = pls["Ranked Duel 1v1"]
    # rating.percentile (92), NO tier.percentile (91)
    assert duel["percentile"] == 92.0
    assert duel["globalRank"] == 629227          # rating.rank
    assert duel["mmr"] == 820
    assert duel["peak"] == 820
    assert duel["divisionUp"] == 18
    assert duel["divisionDown"] == 1
    assert duel["winStreak"] == -1               # type "loss" → negativo

    dbl = pls["Ranked Doubles 2v2"]
    assert dbl["percentile"] == 95.0
    assert dbl["winStreak"] == 3                  # type "win" → positivo


def test_parse_platform_info():
    out = profile._parse(_sample())
    assert out["username"] == "GustoffotsuG"
    assert out["platform"] == "epic"
    assert len(out["playlists"]) == 2


def test_extract_json_at_balances_braces_in_strings():
    text = 'basura window.__INITIAL_STATE__={"a":{"b":"x}y"},"c":2} cola'
    raw = profile._extract_json_at(text, "window.__INITIAL_STATE__")
    assert json.loads(raw) == {"a": {"b": "x}y"}, "c": 2}
