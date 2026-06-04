"""Unitarios puros de las funciones de stats.py (sin BD)."""
from datetime import datetime
from types import SimpleNamespace

import pytest

from routers import stats

pytestmark = pytest.mark.unit


def _stat(**kw):
    base = dict(goals=None, shots=None, saves=None, score=None)
    base.update(kw)
    return SimpleNamespace(**base)


def _rep(**kw):
    base = dict(duration_secs=300.0, team0_score=3, team1_score=1)
    base.update(kw)
    return SimpleNamespace(**base)


# ── _metric_value ────────────────────────────────────────────────────────────
def test_metric_value_direct():
    assert stats._metric_value(_stat(goals=3), "goals") == 3


def test_metric_value_shooting_pct():
    assert stats._metric_value(_stat(goals=2, shots=4), "shooting_pct") == 50.0


def test_metric_value_shooting_pct_zero_shots():
    assert stats._metric_value(_stat(goals=0, shots=0), "shooting_pct") is None
    assert stats._metric_value(_stat(goals=1, shots=None), "shooting_pct") is None


def test_metric_value_missing_key():
    assert stats._metric_value(_stat(), "no_existe") is None


# ── _avg ─────────────────────────────────────────────────────────────────────
def test_avg():
    assert stats._avg([1, 2, 3]) == 2.0
    assert stats._avg([1, None, 3]) == 2.0
    assert stats._avg([]) is None
    assert stats._avg([None]) is None


# ── _is_abnormal (umbrales 180s / diff 5, estricto <) ────────────────────────
def test_is_abnormal_short():
    assert stats._is_abnormal(_rep(duration_secs=179), 180, 5) is True
    assert stats._is_abnormal(_rep(duration_secs=180), 180, 5) is False


def test_is_abnormal_blowout():
    assert stats._is_abnormal(_rep(team0_score=6, team1_score=1), 180, 5) is True   # diff 5
    assert stats._is_abnormal(_rep(team0_score=5, team1_score=1), 180, 5) is False  # diff 4


def test_is_abnormal_normal():
    assert stats._is_abnormal(_rep(duration_secs=300, team0_score=3, team1_score=1), 180, 5) is False


def test_is_abnormal_none():
    assert stats._is_abnormal(_rep(duration_secs=None, team0_score=None, team1_score=None), 180, 5) is False


# ── _parse_date ──────────────────────────────────────────────────────────────
def test_parse_date():
    assert stats._parse_date("2026-05-01T20:00:00") == datetime(2026, 5, 1, 20, 0, 0)
    assert stats._parse_date("2026-05-01") == datetime(2026, 5, 1, 0, 0)
    assert stats._parse_date("no-es-fecha") is None
    assert stats._parse_date(None) is None
    assert stats._parse_date("") is None
