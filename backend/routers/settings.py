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
from database import SessionLocal
from models import PlayerStat

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["settings"])


class SettingsUpdate(BaseModel):
    player_name: Optional[str] = None
    replays_folder: Optional[str] = None


def _known_players() -> list[str]:
    """Jugadores vistos en la BD (para autocompletar el nombre)."""
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
        # read-only (solo arranque)
        "backend_port":   config.BACKEND_PORT,
        "db_path":        config.DB_PATH,
        "timezone":       config.TIMEZONE,
    }


def _retag_is_me(new_name: str):
    """Marca is_me=True solo en las filas del jugador activo (comparación case-insensitive)."""
    db = SessionLocal()
    try:
        db.query(PlayerStat).update({PlayerStat.is_me: False}, synchronize_session=False)
        db.query(PlayerStat).filter(
            func.lower(PlayerStat.player_name) == new_name.lower()
        ).update({PlayerStat.is_me: True}, synchronize_session=False)
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
        settings_store.set(settings_store.KEY_REPLAYS_FOLDER, folder)
        _apply_folder_change()
        changed["replays_folder"] = folder

    result = _effective()
    result["changed"] = changed
    return result
