"""Tests de advanced_stats.compute_advanced (puro, sin BD/red/rrrocket)."""
import pytest

from advanced_stats import compute_advanced
import replay_frames as rf
from tests.factories import build_rrrocket_data

pytestmark = pytest.mark.unit


def _frames_2v2():
    """Un frame con posiciones conocidas. ball en (0,0,100).
    P0(team0) pegado al balón y en campo rival; P1(team0) atrás; P2/P3(team1) juntos."""
    return {
        "duration": 1.0,
        "players": [
            {"name": "P0", "team": 0}, {"name": "P1", "team": 0},
            {"name": "P2", "team": 1}, {"name": "P3", "team": 1},
        ],
        "ball": [[0.0, 0, 0, 100]],
        "cars": [
            [0.0, 0, 0, 100, 17],      # P0: el más cercano al balón, y>0 (ataque para team0)
            [0.0, 1, 0, -4000, 17],    # P1: cerca de su portería
            [0.0, 2, 0, 500, 17],
            [0.0, 3, 0, 600, 17],
        ],
    }


def test_possession_closest_car_wins():
    out = compute_advanced(_frames_2v2())
    p = out["players"]
    assert p[0]["possession_pct"] == 100.0
    assert p[2]["possession_pct"] == 0.0
    # por equipo
    assert out["teams"][0]["possession_pct"] == 100.0
    assert out["teams"][1]["possession_pct"] == 0.0


def test_distances_and_offensive_half():
    p = compute_advanced(_frames_2v2())["players"]
    # P0 en (0,100) → portería propia en y=-5120 → ~52.2 m
    assert p[0]["avg_dist_to_goal"] == pytest.approx(52.2, abs=0.2)
    # P1 cerca de su portería → distancia pequeña
    assert p[1]["avg_dist_to_goal"] == pytest.approx(11.2, abs=0.2)
    # distancia al compañero (team1 P2-P3 muy juntos ~1 m)
    assert p[2]["avg_dist_to_teammate"] == pytest.approx(1.0, abs=0.2)
    # mitad ofensiva: P0 en campo rival (y>0) → 100%; P1 en su campo → 0%
    assert p[0]["time_offensive_half_pct"] == 100.0
    assert p[1]["time_offensive_half_pct"] == 0.0


def test_teammate_distance_none_in_1v1():
    frames = {
        "duration": 1.0,
        "players": [{"name": "A", "team": 0}, {"name": "B", "team": 1}],
        "ball": [[0.0, 0, 0, 100]],
        "cars": [[0.0, 0, -500, 0, 17], [0.0, 1, 500, 0, 17]],
    }
    p = compute_advanced(frames)["players"]
    assert p[0]["avg_dist_to_teammate"] is None
    assert p[1]["avg_dist_to_teammate"] is None


def test_no_ball_means_possession_none_but_distances_ok():
    frames = _frames_2v2()
    frames["ball"] = []
    out = compute_advanced(frames)
    assert out["meta"]["possession_frames"] == 0
    assert out["players"][0]["possession_pct"] is None
    assert out["players"][0]["avg_dist_to_goal"] is not None  # distancias siguen


def test_empty_frames():
    out = compute_advanced({})
    assert out["players"] == {}
    assert out["teams"][0]["possession_pct"] is None


def test_from_parsed_rrrocket_sample():
    # integración con el JSON de rrrocket de muestra (2 coches, 1 por equipo)
    frames = rf._parse_rrrocket(build_rrrocket_data())
    out = compute_advanced(frames)
    assert set(out["players"].keys()) == {0, 1}
    total = sum(out["teams"][t]["possession_pct"] for t in (0, 1))
    assert total == pytest.approx(100.0)
    # 1 coche por equipo → sin compañero
    assert out["players"][0]["avg_dist_to_teammate"] is None
