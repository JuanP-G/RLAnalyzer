"""Tests del mapa de tiros (shot_map.compute_shots, puro — sin BD/subtr/rrrocket)."""
import pytest

from shot_map import compute_shots

pytestmark = pytest.mark.unit


def _ball_line(t0, x0, y0, z0, vy, n=12, dt=0.1):
    """Trayectoria recta del balón a vy UU/s en Y (x,z constantes), desde t0."""
    return [[round(t0 + i * dt, 3), x0, y0 + vy * (i * dt), z0] for i in range(n)]


def test_shot_goal_on_target_and_speed():
    # team0 tira hacia +Y (portería en +5120), centrado, y entra
    ball = _ball_line(10.0, 0.0, 4000.0, 100.0, vy=2000.0)
    frames = {"ball": ball, "goals": [{"team": 0, "time": 10.4}]}
    touches = [{"intention": "shot", "is_team_0": True, "time": 10.0,
                "player": {"Epic": "me"}, "ball_movement": {"end_time": 10.5},
                "ball_position": [0.0, 4000.0, 100.0]}]
    shots = compute_shots(frames, touches)
    assert len(shots) == 1
    s = shots[0]
    assert s["team"] == 0 and s["outcome"] == "gol"
    assert s["on_target"] is True
    assert abs(s["target_x"]) < 50            # centrado
    assert 0 <= s["target_z"] <= 643          # dentro del alto
    assert s["speed_kmh"] == pytest.approx(2000 * 0.036, abs=2)   # ~72 km/h


def test_shot_saved():
    # team1 tira hacia -Y; un rival (team0) hace 'save' en la ventana → parada
    ball = _ball_line(20.0, 0.0, -4000.0, 120.0, vy=-2000.0)
    frames = {"ball": ball, "goals": []}
    touches = [
        {"intention": "shot", "is_team_0": False, "time": 20.0,
         "player": {"Epic": "rival"}, "ball_movement": {"end_time": 20.5}},
        {"intention": "save", "is_team_0": True, "time": 20.3},
    ]
    shots = compute_shots(frames, touches)
    assert len(shots) == 1 and shots[0]["outcome"] == "parada"


def test_shot_wide_is_fuera_and_off_target():
    # tiro muy abierto: cruza el plano lejos del centro → fuera y off-target
    ball = _ball_line(30.0, 0.0, 4000.0, 100.0, vy=400.0)   # avanza poco en Y
    # vx grande: añadimos desplazamiento lateral falseando x creciente
    ball = [[t, 3000.0 * (i / len(ball)), y, z] for i, (t, _x, y, z) in enumerate(ball)]
    frames = {"ball": ball, "goals": []}
    touches = [{"intention": "shot", "is_team_0": True, "time": 30.0,
                "player": {"Epic": "me"}, "ball_movement": {"end_time": 30.6}}]
    shots = compute_shots(frames, touches)
    assert len(shots) == 1
    assert shots[0]["outcome"] == "fuera"


def test_non_shot_touches_ignored():
    frames = {"ball": _ball_line(5.0, 0.0, 0.0, 100.0, vy=500.0), "goals": []}
    touches = [
        {"intention": "control", "is_team_0": True, "time": 5.0},
        {"intention": "clear",   "is_team_0": False, "time": 6.0},
    ]
    assert compute_shots(frames, touches) == []
