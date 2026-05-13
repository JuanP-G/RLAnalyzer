"""
parser.py — RLAnalyzer
Extrae datos de un archivo .replay usando subtr-actor-py
y los convierte al formato que guardamos en SQLite.
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

import subtr_actor

from config import PLAYER_NAME

logger = logging.getLogger(__name__)


def _safe_get(d, *keys, default=None):
    """Navega un dict/lista anidado de forma segura."""
    try:
        for k in keys:
            d = d[k]
        return d
    except (KeyError, TypeError, IndexError):
        return default


def _player_id_value(pid_dict) -> Optional[str]:
    """
    Extrae el valor del ID de jugador de un dict tipo
    {'Epic': 'uuid...'} o {'Steam': '7656...'}.
    """
    if not pid_dict or not isinstance(pid_dict, dict):
        return None
    vals = list(pid_dict.values())
    return str(vals[0]) if vals else None


def parse_replay(file_path: str) -> Optional[dict]:
    """
    Parsea un .replay y devuelve un dict con toda la informacion
    lista para guardar en la base de datos.
    Devuelve None si el archivo no se puede parsear.
    """
    path = Path(file_path)
    if not path.exists():
        logger.error(f"Archivo no encontrado: {file_path}")
        return None

    try:
        # ── 1. parse_replay → estructura principal ───────────────────────────
        # La estructura real es: top-level -> "properties" (no bajo "header")
        try:
            with open(path, "rb") as f:
                full_replay = subtr_actor.parse_replay(f.read())
        except Exception as e:
            logger.warning(f"parse_replay falló ({e})")
            full_replay = {}

        props = _safe_get(full_replay, "properties") or {}

        map_name    = _safe_get(props, "MapName")
        match_type  = _safe_get(props, "MatchType")
        num_frames  = _safe_get(props, "NumFrames")
        record_fps  = _safe_get(props, "RecordFPS") or 30.0
        date_str    = _safe_get(props, "Date")
        team_size   = _safe_get(props, "TeamSize")
        playlist_id = _safe_get(props, "PlaylistId")

        duration_secs = (num_frames / record_fps) if num_frames else None

        # ── 2. get_replay_meta → jugadores y headers ─────────────────────────
        try:
            meta = subtr_actor.get_replay_meta(str(path))
        except Exception as e:
            logger.warning(f"get_replay_meta falló ({e})")
            meta = {}

        replay_meta = _safe_get(meta, "replay_meta") or {}

        # TeamSize de all_headers si no estaba en props
        if team_size is None:
            raw_headers = _safe_get(replay_meta, "all_headers") or []
            all_headers_dict = dict(raw_headers)
            team_size = all_headers_dict.get("TeamSize")

        team_zero_players = _safe_get(replay_meta, "team_zero") or []
        team_one_players  = _safe_get(replay_meta, "team_one") or []

        # ── 3. Goles por equipo ──────────────────────────────────────────────
        goals_list  = _safe_get(props, "Goals") or []
        team0_goals = sum(1 for g in goals_list if _safe_get(g, "PlayerTeam") == 0)
        team1_goals = sum(1 for g in goals_list if _safe_get(g, "PlayerTeam") == 1)

        # ── 4. Fecha de la partida ───────────────────────────────────────────
        played_at = None
        if date_str:
            for fmt in ("%Y-%m-%d %H-%M-%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
                try:
                    played_at = datetime.strptime(str(date_str).strip(), fmt)
                    break
                except ValueError:
                    continue

        # ── 5. Identificar mi equipo ─────────────────────────────────────────
        my_team = None
        for team_num, team_players in [(0, team_zero_players), (1, team_one_players)]:
            for p in team_players:
                name = _safe_get(p, "name") or _safe_get(p, "stats", "Name") or ""
                if str(name).lower() == PLAYER_NAME.lower():
                    my_team = team_num
                    break
            if my_team is not None:
                break

        # ── 6. Resultado ─────────────────────────────────────────────────────
        result = "unknown"
        if my_team is not None:
            my_score    = team0_goals if my_team == 0 else team1_goals
            rival_score = team1_goals if my_team == 0 else team0_goals
            if my_score > rival_score:
                result = "win"
            elif my_score < rival_score:
                result = "loss"
            else:
                result = "draw"

        # ── 7. Stats de boost y movimiento por jugador ───────────────────────
        try:
            stats = subtr_actor.get_stats(
                str(path),
                module_names=["core", "boost", "movement"],
            )
        except Exception as e:
            logger.warning(f"get_stats falló ({e})")
            stats = {}

        boost_module    = _safe_get(stats, "modules", "boost") or {}
        movement_module = _safe_get(stats, "modules", "movement") or {}

        # Lookup {player_id_value -> stats_dict} para boost y movement
        boost_by_pid: dict = {}
        for ps in _safe_get(boost_module, "player_stats") or []:
            pid = _player_id_value(_safe_get(ps, "player_id"))
            if pid:
                boost_by_pid[pid] = _safe_get(ps, "stats") or {}

        movement_by_pid: dict = {}
        for ps in _safe_get(movement_module, "player_stats") or []:
            pid = _player_id_value(_safe_get(ps, "player_id"))
            if pid:
                movement_by_pid[pid] = _safe_get(ps, "stats") or {}

        # ── 8. Construir lista de jugadores ──────────────────────────────────
        players = []
        for team_num, team_players in [(0, team_zero_players), (1, team_one_players)]:
            for p in team_players:
                name      = _safe_get(p, "name") or "Unknown"
                p_stats   = _safe_get(p, "stats") or {}
                remote_id = _safe_get(p, "remote_id") or {}
                pid_value = _player_id_value(remote_id)

                b = boost_by_pid.get(pid_value) or {}
                m = movement_by_pid.get(pid_value) or {}

                is_me = str(name).lower() == PLAYER_NAME.lower()

                players.append({
                    "player_name":      str(name),
                    "platform_id":      pid_value or str(_safe_get(p_stats, "OnlineID") or ""),
                    "team":             team_num,
                    "is_me":            is_me,
                    "score":            _safe_get(p_stats, "Score"),
                    "goals":            _safe_get(p_stats, "Goals"),
                    "assists":          _safe_get(p_stats, "Assists"),
                    "saves":            _safe_get(p_stats, "Saves"),
                    "shots":            _safe_get(p_stats, "Shots"),
                    "demos_inflicted":  None,
                    # Boost individual
                    "boost_collected":  _safe_get(b, "amount_collected"),
                    "boost_stolen":     _safe_get(b, "amount_stolen"),
                    "boost_wasted":     _safe_get(b, "amount_used"),
                    "avg_boost":        _safe_get(b, "boost_integral"),
                    # Movimiento individual
                    # avg_speed en km/h: (speed_integral / tracked_time) UU/s × 0.036
                    # 1 UU = 1 cm → UU/s × 0.01 = m/s × 3.6 = km/h → factor 0.036
                    # Velocidad maxima supersonica: ~2200 UU/s ≈ 79 km/h
                    "avg_speed":        (
                        (_safe_get(m, "speed_integral") / _safe_get(m, "tracked_time")) * 0.036
                        if _safe_get(m, "tracked_time") else None
                    ),
                    "time_supersonic":  _safe_get(m, "time_supersonic_speed"),
                    "time_boost_speed": _safe_get(m, "time_boost_speed"),
                    "time_slow":        _safe_get(m, "time_slow_speed"),
                    "time_on_ground":   _safe_get(m, "time_on_ground"),
                    "time_low_air":     _safe_get(m, "time_low_air"),
                    "time_high_air":    _safe_get(m, "time_high_air"),
                    "total_distance":   _safe_get(m, "total_distance"),
                })

        logger.info(
            f"Parseado: {path.name} | {map_name} | "
            f"{team0_goals}-{team1_goals} | {len(players)} jugadores | {result}"
        )

        # Categoría de partida basada en playlist_id de Rocket League
        # Ranked estándar: 10 (1v1), 11 (2v2), 13 (3v3), 34 (4v4)
        # Modos Extra:     27 (Hoops), 28 (Rumble), 29 (Dropshot), 30 (Snowday)
        # Casual:          el resto (0, 6, 7, 8, etc.)
        _RANKED_IDS = {10, 11, 13, 34}
        _EXTRA_IDS  = {27, 28, 29, 30}
        if playlist_id in _RANKED_IDS:
            game_category = "Ranked"
        elif playlist_id in _EXTRA_IDS:
            game_category = "Extra"
        elif playlist_id is not None:
            game_category = "Casual"
        else:
            game_category = None

        return {
            "file_path":     str(path),
            "file_name":     path.name,
            "map_name":      map_name,
            "match_type":    match_type,
            "team_size":     team_size,
            "playlist_id":   playlist_id,
            "game_category": game_category,
            "duration_secs": duration_secs,
            "played_at":     played_at,
            "result":        result,
            "my_team":       my_team,
            "team0_score":   team0_goals,
            "team1_score":   team1_goals,
            "is_solo_queue": True,
            "raw_meta":      json.dumps(meta, default=str)[:4000],
            "players":       players,
        }

    except Exception as e:
        logger.exception(f"Error parseando {file_path}: {e}")
        return None
