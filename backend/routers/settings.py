"""
routers/settings.py — RLAnalyzer

Ajustes configurables desde la UI:
  GET  /api/settings  → valores efectivos + read-only + jugadores conocidos
  PUT  /api/settings  → cambia player_name (re-tag is_me) y/o replays_folder (reinicia watcher)
"""
import logging
import os
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func

import settings_store
from models import PlayerStat, Replay
# OJO: SessionLocal se importa de forma DIFERIDA dentro de las funciones (no a nivel de
# módulo) para que el monkeypatch de los tests (que sustituye database.SessionLocal por
# la BD de test) se aplique de forma fiable, igual que en profile.py / settings_store.py.

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["settings"])


class SettingsUpdate(BaseModel):
    player_name: Optional[str] = None
    replays_folder: Optional[str] = None
    advanced_background: Optional[bool] = None
    notify_corrupt: Optional[bool] = None
    notify_match_added: Optional[bool] = None
    notify_parse_error: Optional[bool] = None


def _known_players() -> list[str]:
    """Jugadores vistos en la BD (para autocompletar el nombre)."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        rows = (
            db.query(PlayerStat.player_name)
            .distinct()
            .order_by(PlayerStat.player_name)
            .all()
        )
        return [r[0] for r in rows if r[0]]
    finally:
        db.close()


def _effective() -> dict:
    import config
    folder = settings_store.get_replays_folder()
    return {
        "player_name":    settings_store.get_player_name(),
        "replays_folder": folder,
        "folder_exists":  bool(folder) and os.path.exists(folder),
        "advanced_background": settings_store.get_advanced_background(),
        "notify_corrupt":     settings_store.get_notify_corrupt(),
        "notify_match_added": settings_store.get_notify_match_added(),
        "notify_parse_error": settings_store.get_notify_parse_error(),
        # read-only (solo arranque)
        "backend_port":   config.BACKEND_PORT,
        "db_path":        config.DB_PATH,
        "timezone":       config.TIMEZONE,
    }


def _retag_is_me(new_name: str):
    """
    Marca is_me=True solo en las filas del jugador activo (case-insensitive) y recalcula
    Replay.my_team / Replay.result desde SU perspectiva en las partidas donde aparece
    (si el nuevo jugador estuvo en el equipo rival, su V/D estaría invertida si no se recalcula).

    Limitación conocida: las partidas donde el nuevo jugador NO aparece conservan su
    result/my_team antiguos; quedan fuera de las stats personales (no tienen is_me), pero
    aún se cuentan en /stats/summary y en la lista de partidas.
    """
    from database import SessionLocal
    db = SessionLocal()
    try:
        db.query(PlayerStat).update({PlayerStat.is_me: False}, synchronize_session=False)
        db.query(PlayerStat).filter(
            func.lower(PlayerStat.player_name) == new_name.lower()
        ).update({PlayerStat.is_me: True}, synchronize_session=False)
        db.commit()

        # team del nuevo jugador por replay (donde aparece)
        team_by_replay = {
            ps.replay_id: ps.team
            for ps in db.query(PlayerStat).filter(PlayerStat.is_me == True).all()
        }
        for replay in db.query(Replay).all():
            t = team_by_replay.get(replay.id)
            if t is None:
                continue
            replay.my_team = t
            if replay.team0_score is not None and replay.team1_score is not None:
                mine  = replay.team0_score if t == 0 else replay.team1_score
                other = replay.team1_score if t == 0 else replay.team0_score
                replay.result = "win" if mine > other else "loss" if mine < other else "draw"
        db.commit()
    finally:
        db.close()


def _invalidate_profile_cache():
    try:
        from routers import profile
        profile.invalidate_profile()
    except Exception as e:
        logger.debug(f"No se pudo invalidar la caché de perfil: {e}")


def _apply_folder_change():
    """Reinicia el watcher y re-escanea la nueva carpeta. Import diferido para no
    acoplar main/watcher en import-time (ni en los tests)."""
    import main
    main.restart_watcher_and_rescan()


@router.get("/settings")
def get_settings():
    data = _effective()
    data["known_players"] = _known_players()
    return data


@router.put("/settings")
def update_settings(payload: SettingsUpdate):
    changed = {}

    if payload.player_name is not None:
        name = payload.player_name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="player_name no puede estar vacío")
        settings_store.set(settings_store.KEY_PLAYER_NAME, name)
        _retag_is_me(name)
        _invalidate_profile_cache()
        changed["player_name"] = name

    if payload.replays_folder is not None:
        folder = payload.replays_folder.strip()
        if not folder:
            raise HTTPException(status_code=400, detail="La carpeta de replays no puede estar vacía")
        settings_store.set(settings_store.KEY_REPLAYS_FOLDER, folder)
        _apply_folder_change()
        changed["replays_folder"] = folder

    if payload.advanced_background is not None:
        settings_store.set(settings_store.KEY_ADVANCED_BG, "true" if payload.advanced_background else "false")
        changed["advanced_background"] = payload.advanced_background

    if payload.notify_corrupt is not None:
        settings_store.set(settings_store.KEY_NOTIFY_CORRUPT, "true" if payload.notify_corrupt else "false")
        changed["notify_corrupt"] = payload.notify_corrupt

    if payload.notify_match_added is not None:
        settings_store.set(settings_store.KEY_NOTIFY_ADDED, "true" if payload.notify_match_added else "false")
        changed["notify_match_added"] = payload.notify_match_added

    if payload.notify_parse_error is not None:
        settings_store.set(settings_store.KEY_NOTIFY_ERROR, "true" if payload.notify_parse_error else "false")
        changed["notify_parse_error"] = payload.notify_parse_error

    result = _effective()
    result["changed"] = changed
    return result
