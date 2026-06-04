"""Tests de replay_frames.py: helpers puros, _parse_rrrocket, extract_frames y caché."""
import json
import subprocess
from types import SimpleNamespace

import pytest

import replay_frames as rf
from tests.factories import build_rrrocket_data


# ── Helpers puros ─────────────────────────────────────────────────────────────
@pytest.mark.unit
def test_is_ball():
    assert rf._is_ball("Archetypes.Ball.Ball_Default") is True
    assert rf._is_ball("Archetypes.Ball.Ball_Basketball") is False
    assert rf._is_ball("Archetypes.Ball.Ball_Breakout") is False


@pytest.mark.unit
def test_is_car_and_player_info():
    assert rf._is_car("Archetypes.Car.Car_Default") is True
    assert rf._is_car("TAGame.Default__PRI_TA") is False
    assert rf._is_player_info("TAGame.PRI.PlayerReplicationInfo") is True
    assert rf._is_player_info("Archetypes.Car.Car_Default") is False


@pytest.mark.unit
def test_actor_id():
    assert rf._actor_id(5) == 5
    assert rf._actor_id({"value": 7}) == 7


@pytest.mark.unit
def test_uid_key_and_name():
    uid = {"system_id": 1, "remote_id": {"Steam": {"online_id": "abc", "name": "Bob"}}}
    assert rf._uid_key(uid) == "1:Steam:abc"
    assert rf._name_from_uid(uid) == "Bob"
    # Epic sin name → ""
    epic = {"system_id": 1, "remote_id": {"Epic": {"online_id": "xyz"}}}
    assert rf._name_from_uid(epic) == ""
    assert rf._uid_key("no-dict") == ""


@pytest.mark.unit
def test_quat_to_yaw_identity():
    assert rf._quat_to_yaw({"x": 0, "y": 0, "z": 0, "w": 1}) == pytest.approx(0.0)


# ── _parse_rrrocket (pura, con JSON de muestra) ──────────────────────────────
@pytest.mark.unit
def test_parse_rrrocket_happy():
    out = rf._parse_rrrocket(build_rrrocket_data(n_frames=7, goal_frame=3))
    assert out["format"] == 2
    assert out["duration"] == pytest.approx(0.6)            # último frame = 6*0.1
    # 2 jugadores: el de Steam recibe nombre "Mate"; el Epic sin name queda "Car_1"
    assert len(out["players"]) == 2
    names = {p["name"] for p in out["players"]}
    assert "Mate" in names and "Car_1" in names
    teams = sorted(p["team"] for p in out["players"])
    assert teams == [0, 1]
    # gol en frame 3 (time 0.3), equipo 0
    assert out["goals"] == [{"time": pytest.approx(0.3), "team": 0}]
    # ball: filas [t,x,y,z]; primera con z=100
    assert all(len(row) == 4 for row in out["ball"])
    assert out["ball"][0][3] == 100.0
    # cars: filas [t,idx,x,y,z,qx,qy,qz,qw]
    assert all(len(row) == 9 for row in out["cars"])
    # muestreo: 3 frames muestreados (fi 0,3,6) → 3 de balón, 6 de coches (2×3)
    assert len(out["ball"]) == 3
    assert len(out["cars"]) == 6


@pytest.mark.unit
def test_parse_rrrocket_dedup_respawn():
    # Un coche se borra y reaparece (mismo PRI) → sigue habiendo 2 jugadores, no 3
    out = rf._parse_rrrocket(build_rrrocket_data(n_frames=7, respawn=True))
    assert len(out["players"]) == 2


@pytest.mark.unit
def test_parse_rrrocket_empty():
    out = rf._parse_rrrocket({})
    assert out["format"] == 2
    assert out["duration"] == 0
    assert out["players"] == [] and out["ball"] == [] and out["cars"] == []


# ── extract_frames (mock de subprocess) ──────────────────────────────────────
def _patch_exists_true(monkeypatch):
    monkeypatch.setattr(rf.os.path, "exists", lambda p: True)


@pytest.mark.api
def test_extract_frames_ok(monkeypatch):
    _patch_exists_true(monkeypatch)
    proc = SimpleNamespace(returncode=0, stdout=json.dumps(build_rrrocket_data()).encode(), stderr=b"")
    monkeypatch.setattr(rf.subprocess, "run", lambda *a, **k: proc)
    out = rf.extract_frames("X/match.replay")
    assert out["format"] == 2 and out["duration"] > 0


@pytest.mark.api
def test_extract_frames_nonzero_returncode(monkeypatch):
    _patch_exists_true(monkeypatch)
    proc = SimpleNamespace(returncode=1, stdout=b"", stderr=b"boom")
    monkeypatch.setattr(rf.subprocess, "run", lambda *a, **k: proc)
    with pytest.raises(RuntimeError):
        rf.extract_frames("X/match.replay")


@pytest.mark.api
def test_extract_frames_empty_stdout(monkeypatch):
    _patch_exists_true(monkeypatch)
    proc = SimpleNamespace(returncode=0, stdout=b"", stderr=b"")
    monkeypatch.setattr(rf.subprocess, "run", lambda *a, **k: proc)
    with pytest.raises(RuntimeError):
        rf.extract_frames("X/match.replay")


@pytest.mark.api
def test_extract_frames_invalid_json(monkeypatch):
    _patch_exists_true(monkeypatch)
    proc = SimpleNamespace(returncode=0, stdout=b"{not json", stderr=b"")
    monkeypatch.setattr(rf.subprocess, "run", lambda *a, **k: proc)
    with pytest.raises(RuntimeError):
        rf.extract_frames("X/match.replay")


@pytest.mark.api
def test_extract_frames_timeout(monkeypatch):
    _patch_exists_true(monkeypatch)
    def boom(*a, **k):
        raise subprocess.TimeoutExpired(cmd=["rrrocket"], timeout=120)
    monkeypatch.setattr(rf.subprocess, "run", boom)
    with pytest.raises(RuntimeError):
        rf.extract_frames("X/match.replay")


@pytest.mark.api
def test_extract_frames_exe_missing(monkeypatch):
    # exe inexistente → RuntimeError antes de llamar al subprocess
    monkeypatch.setattr(rf.os.path, "exists", lambda p: p != rf.RRROCKET_EXE)
    with pytest.raises(RuntimeError):
        rf.extract_frames("X/match.replay")


# ── get_frames_cached (caché en disco temporal) ──────────────────────────────
@pytest.mark.api
def test_cache_miss_writes_and_returns(frames_cache_tmp, monkeypatch):
    fake = {"format": 2, "duration": 5.0, "players": [], "goals": [], "ball": [[0, 0, 0, 1]], "cars": []}
    monkeypatch.setattr(rf, "extract_frames", lambda path: fake)
    out = rf.get_frames_cached(42, "X/match.replay")
    assert out == fake
    assert (frames_cache_tmp / "42.json").exists()


@pytest.mark.api
def test_cache_hit_does_not_reextract(frames_cache_tmp, monkeypatch):
    valid = {"format": 2, "duration": 5.0, "players": [], "goals": [], "ball": [[0, 0, 0, 1]], "cars": []}
    (frames_cache_tmp / "7.json").write_text(json.dumps(valid), encoding="utf-8")
    def fail(_):
        raise AssertionError("no debería re-extraer con caché válida")
    monkeypatch.setattr(rf, "extract_frames", fail)
    assert rf.get_frames_cached(7, "X/match.replay") == valid


@pytest.mark.api
@pytest.mark.parametrize("bad", [
    {"format": 2, "duration": 0, "ball": [[0, 0, 0, 1]]},   # duration 0
    {"format": 2, "duration": 5.0, "ball": []},             # sin ball
    {"format": 1, "duration": 5.0, "ball": [[0, 0, 0, 1]]}, # formato viejo
])
def test_cache_invalid_reextracts(frames_cache_tmp, monkeypatch, bad):
    (frames_cache_tmp / "9.json").write_text(json.dumps(bad), encoding="utf-8")
    fresh = {"format": 2, "duration": 9.0, "players": [], "goals": [], "ball": [[0, 0, 0, 1]], "cars": []}
    monkeypatch.setattr(rf, "extract_frames", lambda path: fresh)
    assert rf.get_frames_cached(9, "X/match.replay") == fresh
