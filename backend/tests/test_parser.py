"""Tests de parser.py (subtr_actor mockeado, sin binario nativo ni BD real)."""
import json

import pytest

from tests.factories import (
    build_subtr_props, build_subtr_meta, build_subtr_stats, ME, EPIC_ME,
)

pytestmark = pytest.mark.api  # usa fake_subtr (sys.modules) + fichero temporal


# ── Helpers puros ─────────────────────────────────────────────────────────────
def test_safe_get(fake_subtr):
    parser, _ = fake_subtr
    d = {"a": {"b": [10, 20]}}
    assert parser._safe_get(d, "a", "b", 1) == 20
    assert parser._safe_get(d, "a", "x") is None
    assert parser._safe_get(d, "a", "x", default="def") == "def"


def test_player_id_value(fake_subtr):
    parser, _ = fake_subtr
    assert parser._player_id_value({"Epic": "uuid-1"}) == "uuid-1"
    assert parser._player_id_value({}) is None
    assert parser._player_id_value(None) is None
    assert parser._player_id_value({"Steam": 76561190000000001}) == "76561190000000001"


# ── parse_replay: happy path ──────────────────────────────────────────────────
def test_happy_path_2v2(fake_subtr, fake_replay_file):
    parser, fake = fake_subtr
    fake.parse_replay_ret = build_subtr_props(playlist_id=11, goals_teams=(0, 1, 0))
    fake.replay_meta_ret = build_subtr_meta()
    fake.get_stats_ret = build_subtr_stats()

    out = parser.parse_replay(fake_replay_file)

    assert out is not None
    assert out["map_name"] == "DFH Stadium"
    assert out["team_size"] == 2
    assert out["playlist_id"] == 11 and out["game_category"] == "Ranked"
    assert out["duration_secs"] == 9000 / 30.0
    assert out["played_at"].year == 2026 and out["played_at"].minute == 30
    assert out["my_team"] == 0
    assert out["team0_score"] == 2 and out["team1_score"] == 1
    assert out["result"] == "win"
    assert len(out["players"]) == 4

    me = next(p for p in out["players"] if p["is_me"])
    assert me["player_name"] == ME
    assert me["goals"] == 2 and me["saves"] == 2
    assert me["boost_wasted"] == 2100.0       # = amount_used
    assert me["avg_boost"] == 45.0            # = boost_integral
    assert me["avg_speed"] == pytest.approx((180000.0 / 120.0) * 0.036)  # km/h = 54.0
    assert me["platform_id"] == EPIC_ME


# ── Ramas ─────────────────────────────────────────────────────────────────────
def test_file_not_found(fake_subtr):
    parser, _ = fake_subtr
    assert parser.parse_replay("C:/no/existe/match.replay") is None


def test_no_me_in_match(fake_subtr, fake_replay_file):
    parser, fake = fake_subtr
    fake.parse_replay_ret = build_subtr_props()
    fake.replay_meta_ret = build_subtr_meta(me="JugadorDesconocido")
    fake.get_stats_ret = build_subtr_stats()
    out = parser.parse_replay(fake_replay_file)
    assert out["my_team"] is None
    assert out["result"] == "unknown"


def test_get_stats_raises_means_none_stats(fake_subtr, fake_replay_file):
    parser, fake = fake_subtr
    fake.parse_replay_ret = build_subtr_props()
    fake.replay_meta_ret = build_subtr_meta()
    fake.get_stats_ret = RuntimeError("boom")
    out = parser.parse_replay(fake_replay_file)
    me = next(p for p in out["players"] if p["is_me"])
    assert me["boost_collected"] is None
    assert me["avg_speed"] is None


def test_date_invalid(fake_subtr, fake_replay_file):
    parser, fake = fake_subtr
    fake.parse_replay_ret = build_subtr_props(date="no-es-fecha")
    fake.replay_meta_ret = build_subtr_meta()
    fake.get_stats_ret = build_subtr_stats()
    assert parser.parse_replay(fake_replay_file)["played_at"] is None


def test_date_absent(fake_subtr, fake_replay_file):
    parser, fake = fake_subtr
    fake.parse_replay_ret = build_subtr_props(date=None)
    fake.replay_meta_ret = build_subtr_meta()
    fake.get_stats_ret = build_subtr_stats()
    assert parser.parse_replay(fake_replay_file)["played_at"] is None


def test_playlist_unknown_is_casual(fake_subtr, fake_replay_file):
    parser, fake = fake_subtr
    fake.parse_replay_ret = build_subtr_props(playlist_id=6)
    fake.replay_meta_ret = build_subtr_meta()
    fake.get_stats_ret = build_subtr_stats()
    assert parser.parse_replay(fake_replay_file)["game_category"] == "Casual"


def test_playlist_none(fake_subtr, fake_replay_file):
    parser, fake = fake_subtr
    fake.parse_replay_ret = build_subtr_props(playlist_id=None)
    fake.replay_meta_ret = build_subtr_meta()
    fake.get_stats_ret = build_subtr_stats()
    assert parser.parse_replay(fake_replay_file)["game_category"] is None


def test_tracked_time_zero_means_avg_speed_none(fake_subtr, fake_replay_file):
    parser, fake = fake_subtr
    fake.parse_replay_ret = build_subtr_props()
    fake.replay_meta_ret = build_subtr_meta()
    fake.get_stats_ret = build_subtr_stats(tracked_time=0)
    me = next(p for p in parser.parse_replay(fake_replay_file)["players"] if p["is_me"])
    assert me["avg_speed"] is None


def test_parse_replay_native_raises_still_returns_dict(fake_subtr, fake_replay_file, monkeypatch):
    parser, fake = fake_subtr
    fake.parse_replay_ret = RuntimeError("nativo roto")
    fake.replay_meta_ret = build_subtr_meta()
    fake.get_stats_ret = build_subtr_stats()
    # Evitar que el fallback de cabecera invoque el binario real en este test
    monkeypatch.setattr(parser, "_build_from_header", lambda path: None)
    out = parser.parse_replay(fake_replay_file)
    assert out is not None            # no devuelve None: props quedan vacíos
    assert out["map_name"] is None


def _fake_header(team0=2, team1=3):
    return {"properties": {
        "MapName": "cs_p", "MatchType": "Online", "TeamSize": 2,
        "Date": "2026-06-18 13-45-10", "NumFrames": 11359, "RecordFPS": 30.0,
        "Team0Score": team0, "Team1Score": team1,
        "PlayerStats": [
            {"Name": ME, "Team": 0, "Score": 563, "Goals": 2, "Assists": 0, "Saves": 1,
             "Shots": 7, "PlayerID": {"fields": {"EpicAccountId": "epic-me"}}, "OnlineID": "0"},
            {"Name": "Mate", "Team": 0, "Score": 300, "Goals": 0, "Assists": 1, "Saves": 2,
             "Shots": 3, "PlayerID": {"fields": {"EpicAccountId": "epic-mate"}}, "OnlineID": "0"},
            {"Name": "Opp1", "Team": 1, "Score": 648, "Goals": 1, "Assists": 1, "Saves": 4,
             "Shots": 2, "PlayerID": {"fields": {"EpicAccountId": "0"}}, "OnlineID": "steam-1"},
            {"Name": "Opp2", "Team": 1, "Score": 671, "Goals": 2, "Assists": 1, "Saves": 3,
             "Shots": 6, "PlayerID": {"fields": {"EpicAccountId": "epic-opp2"}}, "OnlineID": "0"},
        ],
    }}


def test_fallback_to_rrrocket_header(fake_subtr, fake_replay_file, monkeypatch):
    """Si subtr-actor no parsea (p. ej. atributo nuevo de RL), la partida se reconstruye
    desde la cabecera de rrrocket: mapa + equipos + marcador + box-score; stats detalladas
    en None y categoría None (la cabecera no trae playlist)."""
    parser, fake = fake_subtr
    fake.parse_replay_ret = {}        # subtr no da nada
    fake.replay_meta_ret = {}
    fake.get_stats_ret = {}

    class _Res:
        returncode = 0
        stdout = json.dumps(_fake_header()).encode("utf-8")
    monkeypatch.setattr(parser.subprocess, "run", lambda *a, **k: _Res())
    monkeypatch.setattr("os.path.exists", lambda p: True)   # rrrocket.exe "existe"

    data = parser.parse_replay(fake_replay_file)
    assert data is not None
    assert data["map_name"] == "cs_p"
    assert data["team_size"] == 2
    assert (data["team0_score"], data["team1_score"]) == (2, 3)
    assert data["my_team"] == 0 and data["result"] == "loss"
    assert data["game_category"] is None and data["playlist_id"] is None
    assert len(data["players"]) == 4
    me = next(p for p in data["players"] if p["is_me"])
    assert me["goals"] == 2 and me["platform_id"] == "epic-me"
    assert me["boost_collected"] is None and me["avg_speed"] is None   # detalle no disponible


def test_uses_get_summed_stats_when_present(fake_subtr, fake_replay_file, monkeypatch):
    """subtr-actor >=1.0 renombró get_stats → get_summed_stats. El parser usa la que exista."""
    import sys
    parser, fake = fake_subtr
    fake.parse_replay_ret = build_subtr_props()
    fake.replay_meta_ret = build_subtr_meta()
    fake.get_stats_ret = build_subtr_stats()
    mod = sys.modules["subtr_actor"]
    mod.get_summed_stats = fake.get_stats        # API nueva
    monkeypatch.delattr(mod, "get_stats", raising=False)   # la antigua ya no está
    me = next(p for p in parser.parse_replay(fake_replay_file)["players"] if p["is_me"])
    assert me["avg_boost"] == 45.0 and me["boost_wasted"] == 2100.0   # leído vía get_summed_stats


def test_fallback_header_not_a_match_returns_none(fake_subtr, fake_replay_file, monkeypatch):
    """Si ni la cabecera tiene mapa o <2 jugadores, no se inventa nada (la ingesta lo rechaza)."""
    parser, fake = fake_subtr
    fake.parse_replay_ret = {}
    fake.replay_meta_ret = {}
    fake.get_stats_ret = {}

    class _Res:
        returncode = 0
        stdout = json.dumps({"properties": {"MapName": None, "PlayerStats": []}}).encode("utf-8")
    monkeypatch.setattr(parser.subprocess, "run", lambda *a, **k: _Res())
    monkeypatch.setattr("os.path.exists", lambda p: True)

    data = parser.parse_replay(fake_replay_file)
    # subtr vacío + cabecera no-partida → dict con map_name None (la ingesta lo descartará)
    assert data["map_name"] is None and len(data["players"]) == 0


def test_demos_extracted(fake_subtr, fake_replay_file):
    """El módulo demo de subtr puebla demos_inflicted/taken y marca demos_computed."""
    parser, fake = fake_subtr
    fake.parse_replay_ret = build_subtr_props()
    fake.replay_meta_ret = build_subtr_meta()
    fake.get_stats_ret = build_subtr_stats()           # incluye módulo demo
    me = next(p for p in parser.parse_replay(fake_replay_file)["players"] if p["is_me"])
    assert me["demos_inflicted"] == 2 and me["demos_taken"] == 1
    assert me["demos_computed"] is True


def test_demos_absent_module_leaves_none(fake_subtr, fake_replay_file):
    """Sin módulo demo (subtr antiguo o fallo), demos quedan None y demos_computed False."""
    parser, fake = fake_subtr
    fake.parse_replay_ret = build_subtr_props()
    fake.replay_meta_ret = build_subtr_meta()
    fake.get_stats_ret = build_subtr_stats(include_demo=False)
    me = next(p for p in parser.parse_replay(fake_replay_file)["players"] if p["is_me"])
    assert me["demos_inflicted"] is None and me["demos_taken"] is None
    assert me["demos_computed"] is False


def test_result_loss(fake_subtr, fake_replay_file):
    parser, fake = fake_subtr
    fake.parse_replay_ret = build_subtr_props(goals_teams=(1, 1, 0))  # team0=1, team1=2
    fake.replay_meta_ret = build_subtr_meta()                          # yo en team_zero
    fake.get_stats_ret = build_subtr_stats()
    out = parser.parse_replay(fake_replay_file)
    assert out["team0_score"] == 1 and out["team1_score"] == 2
    assert out["my_team"] == 0 and out["result"] == "loss"


def test_extra_mode_playlist(fake_subtr, fake_replay_file):
    parser, fake = fake_subtr
    fake.parse_replay_ret = build_subtr_props(playlist_id=28)  # Rumble
    fake.replay_meta_ret = build_subtr_meta()
    fake.get_stats_ret = build_subtr_stats()
    assert parser.parse_replay(fake_replay_file)["game_category"] == "Extra"
