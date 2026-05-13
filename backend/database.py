from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from config import DB_PATH

DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from models import Replay, PlayerStat  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _migrate()


_RANKED_IDS = {10, 11, 13, 34}
_EXTRA_IDS  = {27, 28, 29, 30}

def _playlist_to_category(pid):
    if pid is None:
        return None
    if pid in _RANKED_IDS:
        return "Ranked"
    if pid in _EXTRA_IDS:
        return "Extra"
    return "Casual"


def _migrate():
    """Añade columnas nuevas a tablas existentes y backfill."""
    import logging
    log = logging.getLogger(__name__)

    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(replays)"))]

        if "is_favorite" not in cols:
            conn.execute(text("ALTER TABLE replays ADD COLUMN is_favorite BOOLEAN DEFAULT 0"))
            conn.commit()
            log.info("Migración: columna is_favorite añadida")

        if "playlist_id" not in cols:
            conn.execute(text("ALTER TABLE replays ADD COLUMN playlist_id INTEGER"))
            conn.execute(text("ALTER TABLE replays ADD COLUMN game_category TEXT"))
            conn.commit()
            log.info("Migración: columnas playlist_id y game_category añadidas — iniciando backfill...")
            _backfill_categories(conn, log)

        elif "game_category" not in cols:
            conn.execute(text("ALTER TABLE replays ADD COLUMN game_category TEXT"))
            conn.commit()
            _backfill_categories(conn, log)


def _backfill_categories(conn, log):
    """Re-extrae playlist_id de cada .replay existente para rellenar game_category."""
    try:
        import subtr_actor
        from pathlib import Path
    except ImportError:
        log.warning("subtr_actor no disponible — backfill omitido")
        return

    rows = conn.execute(
        text("SELECT id, file_path FROM replays WHERE game_category IS NULL")
    ).fetchall()

    updated = 0
    for row_id, file_path in rows:
        try:
            p = Path(file_path)
            if not p.exists():
                continue
            with open(p, "rb") as f:
                data = subtr_actor.parse_replay(f.read())
            pid = (data.get("properties") or {}).get("PlaylistId")
            cat = _playlist_to_category(pid)
            conn.execute(
                text("UPDATE replays SET playlist_id=:pid, game_category=:cat WHERE id=:id"),
                {"pid": pid, "cat": cat, "id": row_id},
            )
            updated += 1
        except Exception as e:
            log.debug(f"backfill skip {file_path}: {e}")

    if updated:
        conn.commit()
        log.info(f"Backfill completado: {updated} replays actualizados")
