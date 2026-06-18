"""
main.py — RLAnalyzer Backend
Punto de entrada de FastAPI. Arranca el servidor, el watcher
y procesa los replays en un bucle de background.
"""

import asyncio
import logging
import sys
import os

# Añadir el directorio backend al path para que los imports funcionen
sys.path.insert(0, os.path.dirname(__file__))

# Carga las variables de backend/.env (TRACKER_API_KEY, etc.)
_env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _v = _line.split("=", 1)
                os.environ.setdefault(_k.strip(), _v.strip())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from database import init_db, SessionLocal
from models import Replay, PlayerStat
from parser import parse_replay
from watcher import ReplayWatcher, get_pending_and_clear, mark_processed, scan_existing_replays
from routers.replays import router
from routers.profile import router as profile_router
from routers.players import router as players_router
from routers.viewer  import router as viewer_router
from routers.stats   import router as stats_router
from routers.settings import router as settings_router
from config import BACKEND_PORT

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── Instancia del watcher ──────────────────────────────────────────────────
watcher = ReplayWatcher()


def save_replay_to_db(data: dict):
    """Guarda los datos parseados de un replay en la base de datos."""
    import events
    db = SessionLocal()
    try:
        # ── Partida no válida (corrupta / freeplay / menú) → no se añade, se notifica ──
        if not events.is_valid_match(data):
            logger.warning(f"Replay no válido (corrupto/no-partida), no se añade: {data.get('file_name')}")
            events.add_rejected(data.get("file_name") or data.get("file_path"))
            return

        # Evitar duplicados
        existing = db.query(Replay).filter(Replay.file_path == data["file_path"]).first()
        if existing:
            logger.info(f"Replay ya procesado: {data['file_name']}")
            return

        replay = Replay(
            file_path     = data["file_path"],
            file_name     = data["file_name"],
            map_name      = data["map_name"],
            match_type    = data["match_type"],
            team_size     = data["team_size"],
            playlist_id   = data.get("playlist_id"),
            game_category = data.get("game_category"),
            duration_secs = data["duration_secs"],
            played_at     = data["played_at"],
            result        = data["result"],
            my_team       = data["my_team"],
            team0_score   = data["team0_score"],
            team1_score   = data["team1_score"],
            is_solo_queue = data["is_solo_queue"],
            raw_meta      = data["raw_meta"],
        )
        db.add(replay)
        db.flush()  # para obtener el ID

        for p in data.get("players", []):
            stat = PlayerStat(
                replay_id        = replay.id,
                player_name      = p["player_name"],
                platform_id      = p.get("platform_id"),
                team             = p.get("team"),
                is_me            = p.get("is_me", False),
                score            = p.get("score"),
                goals            = p.get("goals"),
                assists          = p.get("assists"),
                saves            = p.get("saves"),
                shots            = p.get("shots"),
                demos_inflicted  = p.get("demos_inflicted"),
                demos_taken      = p.get("demos_taken"),
                demos_computed   = p.get("demos_computed", False),
                boost_collected  = p.get("boost_collected"),
                boost_stolen     = p.get("boost_stolen"),
                boost_wasted     = p.get("boost_wasted"),
                avg_boost        = p.get("avg_boost"),
                avg_speed        = p.get("avg_speed"),
                time_supersonic  = p.get("time_supersonic"),
                time_boost_speed = p.get("time_boost_speed"),
                time_slow        = p.get("time_slow"),
                time_on_ground   = p.get("time_on_ground"),
                time_low_air     = p.get("time_low_air"),
                time_high_air    = p.get("time_high_air"),
                total_distance   = p.get("total_distance"),
            )
            db.add(stat)

        db.commit()
        logger.info(f"Replay guardado: {data['file_name']} — {data['result']}")

        # Notificar la nueva partida (marcador desde la perspectiva del jugador)
        t0, t1 = data.get("team0_score"), data.get("team1_score")
        score = None
        if t0 is not None and t1 is not None:
            mine, other = (t0, t1) if data.get("my_team") == 0 else (t1, t0)
            score = f"{mine}-{other}"
        events.add_match_added(data.get("map_name"), data.get("result"), score)

    except Exception as e:
        db.rollback()
        logger.exception(f"Error guardando replay: {e}")
    finally:
        db.close()


def compute_and_persist_demos(db, replay) -> bool:
    """Extrae el módulo `demo` de subtr-actor para un replay y persiste demos_inflicted /
    demos_taken en sus PlayerStat (emparejando por platform_id). Lo usa el backfill.
    Devuelve True si se obtuvo el módulo demo."""
    try:
        import subtr_actor
        from parser import _player_id_value, _safe_get
    except Exception as e:
        logger.warning(f"demos: subtr-actor no disponible ({e})")
        return False
    fn = getattr(subtr_actor, "get_summed_stats", None) or getattr(subtr_actor, "get_stats", None)
    if not fn:
        return False
    try:
        stats = fn(str(replay.file_path), module_names=["demo"])
        demo_module = _safe_get(stats, "modules", "demo")
    except Exception as e:
        logger.warning(f"demos replay {replay.id}: {e}")
        return False
    if demo_module is None:
        return False
    by_pid = {}
    for ps in _safe_get(demo_module, "player_stats") or []:
        pid = _player_id_value(_safe_get(ps, "player_id"))
        if pid:
            by_pid[pid] = _safe_get(ps, "stats") or {}
    for p in replay.players:
        d = by_pid.get(p.platform_id) or {}
        p.demos_inflicted = d.get("demos_inflicted")
        p.demos_taken     = d.get("demos_taken")
        p.demos_computed  = True   # intentada aunque no casara el id (no reintentar)
    db.commit()
    return True


def restart_watcher_and_rescan():
    """Reinicia el watcher con la carpeta actual y encola los .replay nuevos.
    Lo invoca el endpoint PUT /api/settings al cambiar la carpeta de replays."""
    from watcher import scan_existing_replays, _processed_files, _pending_files
    watcher.restart()
    db = SessionLocal()
    try:
        in_db = {r.file_path for r in db.query(Replay.file_path).all()}
    finally:
        db.close()
    new_files = scan_existing_replays(in_db | set(_processed_files))
    if new_files:
        _pending_files.extend(new_files)
        logger.info(f"Carpeta cambiada: {len(new_files)} replays encolados")


async def process_pending_loop():
    """Bucle de background que procesa replays pendientes cada 5 segundos."""
    while True:
        pending = get_pending_and_clear()
        for file_path in pending:
            logger.info(f"Procesando: {file_path}")
            data = parse_replay(file_path)
            if data:
                save_replay_to_db(data)
                mark_processed(file_path)
            else:
                logger.warning(f"No se pudo parsear: {file_path}")
                import events
                events.add_parse_error(os.path.basename(file_path))
                mark_processed(file_path)   # no reintentar en bucle un replay ilegible
        await asyncio.sleep(5)


async def _backfill_loop(label, flag_col, compute_fn, initial_delay=25):
    """Bucle genérico de backfill en segundo plano: busca partidas cuyos PlayerStat tienen
    `flag_col` en False y, si hay .replay local, las calcula con `compute_fn(db, replay)`
    (una por iteración, ~12s, para no saturar). Las no calculables (sin archivo o error) se
    marcan como intentadas para llegar al 100% y no reintentarlas. Pausable desde Ajustes."""
    import os as _os
    import settings_store

    flag_attr = flag_col.key
    def _mark_attempted(replay, db):
        for p in replay.players:
            setattr(p, flag_attr, True)
        db.commit()

    await asyncio.sleep(initial_delay)
    while True:
        try:
            if settings_store.get_advanced_background():
                db = SessionLocal()
                try:
                    pending_ids = [
                        row[0] for row in db.query(PlayerStat.replay_id)
                        .filter(flag_col == False).distinct().limit(100).all()
                    ]
                    for rid in pending_ids:
                        r = db.get(Replay, rid)
                        if not r:
                            continue
                        if not r.file_path or not _os.path.exists(r.file_path):
                            _mark_attempted(r, db)
                            continue
                        logger.info(f"{label}: replay {rid}")
                        if not compute_fn(db, r):
                            _mark_attempted(r, db)
                        break   # solo una extracción real por iteración (ritmo suave)
                finally:
                    db.close()
        except Exception as e:
            logger.warning(f"{label}: {e}")
        await asyncio.sleep(12)


async def advanced_backfill_loop():
    """Backfill de stats avanzadas (posición/posesión) — frames con rrrocket."""
    from routers.replays import compute_and_persist_advanced
    await _backfill_loop("Backfill stats avanzadas", PlayerStat.advanced_computed,
                         compute_and_persist_advanced, initial_delay=25)


async def demos_backfill_loop():
    """Backfill de demoliciones (módulo demo de subtr-actor) en partidas ya guardadas."""
    await _backfill_loop("Backfill demos", PlayerStat.demos_computed,
                         compute_and_persist_demos, initial_delay=35)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup y shutdown de la app."""
    # ── Startup ──────────────────────────────────────────────────────────
    logger.info("=" * 50)
    logger.info("  RLAnalyzer Backend arrancando...")
    logger.info("=" * 50)

    # Crear tablas si no existen
    init_db()

    # Limpiar partidas no válidas (corruptas/no-partidas) que ya estuvieran en la BD
    from routers.replays import delete_invalid_replays
    db = SessionLocal()
    try:
        removed = delete_invalid_replays(db)
        if removed:
            logger.info(f"Limpieza: {removed} partidas no válidas eliminadas de la BD")
    finally:
        db.close()

    # Escanear replays ya existentes que no estén en la BD
    db = SessionLocal()
    try:
        processed = {r.file_path for r in db.query(Replay.file_path).all()}
    finally:
        db.close()

    existing_new = scan_existing_replays(processed)
    if existing_new:
        logger.info(f"Encontrados {len(existing_new)} replays sin procesar. Procesando...")
        from watcher import _pending_files
        _pending_files.extend(existing_new)

    # Arrancar el watcher de archivos
    watcher.start()

    # Arrancar los bucles de background: procesado de nuevos replays + backfills
    task = asyncio.create_task(process_pending_loop())
    task_adv = asyncio.create_task(advanced_backfill_loop())
    task_demos = asyncio.create_task(demos_backfill_loop())

    logger.info("Backend listo en http://localhost:8000")
    logger.info("Documentación API en http://localhost:8000/docs")

    yield  # La app está corriendo

    # ── Shutdown ──────────────────────────────────────────────────────────
    task.cancel()
    task_adv.cancel()
    task_demos.cancel()
    watcher.stop()
    logger.info("Backend detenido.")


# ── Crear la app ───────────────────────────────────────────────────────────
app = FastAPI(
    title="RLAnalyzer API",
    description="Backend para el análisis de replays de Rocket League",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS: permitir peticiones del frontend (localhost:5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar rutas
app.include_router(router)
app.include_router(profile_router)
app.include_router(players_router)
app.include_router(viewer_router)
app.include_router(stats_router)
app.include_router(settings_router)


@app.get("/")
def root():
    return {"message": "RLAnalyzer API funcionando", "docs": "/docs"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=BACKEND_PORT, reload=False)
