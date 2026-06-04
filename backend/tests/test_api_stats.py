"""Tests de los endpoints de /api/stats (BD temporal en memoria)."""
from datetime import datetime

import pytest

from tests.factories import make_replay, make_player

pytestmark = pytest.mark.api


def test_glossary(client):
    g = client.get("/api/stats/glossary").json()
    assert g["abnormal"]["min_duration"] == 180
    assert g["abnormal"]["max_goal_diff"] == 5
    assert len(g["metrics"]) == 17
    keys = {m["key"] for m in g["metrics"]}
    assert "shooting_pct" in keys and "avg_boost" in keys


def test_analysis_roles(client, db):
    make_replay(db, result="win", team_size=2, my_team=0)  # yo=2, mate=1, opp=0 goles
    a = client.get("/api/stats/analysis").json()
    goals = next(m for m in a["metrics"] if m["key"] == "goals")
    assert goals["me"]["overall"] == 2.0
    assert goals["teammates"]["overall"] == 1.0
    assert goals["opponents"]["overall"] == 0.0


def test_analysis_abnormal_excluded_from_means_not_winrate(client, db):
    make_replay(db, result="win", duration_secs=300, team0_score=3, team1_score=1)   # normal win
    make_replay(db, result="loss", duration_secs=300, team0_score=1, team1_score=3)  # normal loss
    make_replay(db, result="win", duration_secs=300, team0_score=6, team1_score=0)   # paliza (anómala)

    a = client.get("/api/stats/analysis").json()
    assert a["games"] == 3
    assert a["wins"] == 2
    assert a["win_rate"] == round(2 / 3 * 100, 1)   # win rate cuenta la anómala
    assert a["excluded_abnormal"] == 1
    assert a["analyzed_games"] == 2                  # medias excluyen la anómala

    a2 = client.get("/api/stats/analysis?exclude_abnormal=false").json()
    assert a2["analyzed_games"] == 3
    assert a2["excluded_abnormal"] == 0


def test_analysis_skips_replay_without_me(client, db):
    players = [make_player("X", 0, goals=1), make_player("Y", 1, goals=1)]
    make_replay(db, players=players)
    assert client.get("/api/stats/analysis").json()["games"] == 0


def test_dashboard_kpis(client, db):
    make_replay(db, result="win")
    make_replay(db, result="loss")
    d = client.get("/api/stats/dashboard").json()
    assert d["kpis"]["games"] == 2
    assert d["kpis"]["wins"] == 1
    assert d["kpis"]["losses"] == 1
    assert d["recent_form"]["total"] == 2


def test_dashboard_recent_form_ignores_result_filter(client, db):
    make_replay(db, result="win", played_at=datetime(2026, 5, 1))
    make_replay(db, result="loss", played_at=datetime(2026, 5, 2))
    d = client.get("/api/stats/dashboard?result=win").json()
    assert d["kpis"]["games"] == 1          # el filtro result afecta a los KPIs
    assert d["recent_form"]["total"] == 2   # pero NO a la forma reciente


def test_analysis_filters(client, db):
    make_replay(db, team_size=2, game_category="Ranked")
    f = client.get("/api/stats/analysis/filters").json()
    assert "team_sizes" in f and "categories" in f
    assert f["defaults"]["min_duration"] == 180
    assert f["defaults"]["max_goal_diff"] == 5


def test_summary(client, db):
    make_replay(db, result="win")
    s = client.get("/api/stats/summary").json()
    assert s["total_replays"] == 1
    assert s["wins"] == 1


def test_me(client, db):
    make_replay(db, result="win")   # yo: goals=2 (default_match)
    make_replay(db, result="loss")
    me = client.get("/api/stats/me").json()
    assert me["overall"]["count"] == 2
    assert me["overall"]["goals"] == 2.0
    assert me["wins"]["count"] == 1
    assert me["losses"]["count"] == 1


def test_me_empty(client):
    me = client.get("/api/stats/me").json()
    assert me["overall"] is None   # sin partidas → None en cada tramo
    assert me["wins"] is None
