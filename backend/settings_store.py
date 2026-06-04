"""
settings_store.py — RLAnalyzer

Accesor de ajustes configurables en runtime, con caché en memoria y fallback a los
valores por defecto de config.py. Los call-sites leen por función (no por binding de
import), de modo que un cambio vía /api/settings se refleja en todo el backend.

Imports diferidos de SessionLocal/Setting/config dentro de las funciones: evita ciclos
de import y permite monkeypatchear SessionLocal en los tests.
"""
import logging
from threading import Lock

logger = logging.getLogger(__name__)

KEY_PLAYER_NAME    = "player_name"
KEY_REPLAYS_FOLDER = "replays_folder"

_cache: dict = {}
_loaded = False
_lock = Lock()


def _defaults() -> dict:
    import config
    return {
        KEY_PLAYER_NAME:    config.PLAYER_NAME,
        KEY_REPLAYS_FOLDER: config.REPLAYS_FOLDER,
    }


def _load_all():
    """Carga todos los settings de la BD a la caché. Si la BD/tabla no está lista, no
    marca cargado (así se reintenta) y se usan los defaults."""
    global _loaded
    from database import SessionLocal   # diferido: clave para monkeypatch en tests
    from models import Setting
    db = SessionLocal()
    try:
        for row in db.query(Setting).all():
            _cache[row.key] = row.value
        _loaded = True
    except Exception as e:
        logger.warning(f"settings_store: usando defaults ({e})")
    finally:
        db.close()


def get(key: str, default=None):
    with _lock:
        if not _loaded:
            _load_all()
        if _cache.get(key) is not None:
            return _cache[key]
    return _defaults().get(key, default)


def set(key: str, value: str):
    from database import SessionLocal
    from models import Setting
    db = SessionLocal()
    try:
        row = db.get(Setting, key)
        if row is None:
            db.add(Setting(key=key, value=value))
        else:
            row.value = value
        db.commit()
    finally:
        db.close()
    with _lock:
        _cache[key] = value


def invalidate():
    """Vacía la caché (fuerza recarga en el próximo get). Útil en tests."""
    global _loaded
    with _lock:
        _cache.clear()
        _loaded = False


def get_player_name() -> str:
    return get(KEY_PLAYER_NAME, _defaults()[KEY_PLAYER_NAME]) or _defaults()[KEY_PLAYER_NAME]


def get_replays_folder() -> str:
    return get(KEY_REPLAYS_FOLDER, _defaults()[KEY_REPLAYS_FOLDER]) or _defaults()[KEY_REPLAYS_FOLDER]
