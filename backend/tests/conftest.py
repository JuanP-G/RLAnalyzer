"""
Fixtures de pytest para el backend de RLAnalyzer.

Aislamiento total: BD SQLite en memoria (no toca data/rl_data.db), sin red, sin
binarios nativos (subtr_actor/rrrocket), sin watcher ni lifespan. NO se importa
`main` ni `parser` (parser hace `import subtr_actor` a nivel módulo y rompería);
en su lugar se monta una app de test mínima con los routers reales y un override
de `get_db`.
"""
import sys
import types

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
import models  # registra Replay / PlayerStat en Base.metadata


@pytest.fixture(scope="session")
def engine():
    # SQLite en memoria compartida entre hilos: StaticPool reutiliza una única
    # conexión, imprescindible para que el TestClient (otro hilo) vea las tablas.
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    yield eng
    eng.dispose()


@pytest.fixture(scope="session")
def TestSessionLocal(engine):
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture
def db(TestSessionLocal):
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _patch_sessionlocal(TestSessionLocal, monkeypatch):
    """
    Redirige el SessionLocal global a la BD de test. Necesario porque settings_store,
    el re-tag de is_me y known_players usan `SessionLocal()` directo (no el override de
    get_db). Funciona porque esos call-sites importan SessionLocal de forma diferida.
    """
    import database
    monkeypatch.setattr(database, "SessionLocal", TestSessionLocal)
    import settings_store
    settings_store.invalidate()
    yield
    settings_store.invalidate()


@pytest.fixture(autouse=True)
def _clean_tables(db):
    """
    Limpia las tablas tras cada test usando la MISMA sesión del test, de modo que
    también descarta filas no commiteadas (p. ej. make_replay(commit=False)).
    Hijos antes que padres por la FK.
    """
    yield
    db.rollback()  # descarta lo no commiteado del test
    db.query(models.PlayerStat).delete()
    db.query(models.Replay).delete()
    db.query(models.Setting).delete()
    db.commit()


@pytest.fixture(autouse=True)
def _reset_events():
    """Vacía el feed en memoria de events entre tests (deque + seq son globales de módulo,
    si no se acumulan y los asserts sobre seq/contenido se vuelven frágiles al orden)."""
    import events
    events._events.clear()
    events._seq = 0
    yield
    events._events.clear()
    events._seq = 0


@pytest.fixture
def client(db):
    """TestClient sobre una app mínima (sin lifespan) que comparte la sesión `db`."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from routers.replays import router as replays_router
    from routers.stats import router as stats_router
    from routers.players import router as players_router
    from routers.viewer import router as viewer_router
    from routers.settings import router as settings_router

    app = FastAPI()
    for r in (replays_router, stats_router, players_router, viewer_router, settings_router):
        app.include_router(r)

    def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── Mock de subtr_actor para testear parser.py ───────────────────────────────
class FakeSubtr:
    """Respuestas configurables de subtr_actor. Si un retorno es una Exception,
    se lanza al llamarlo (para ejercitar los try/except de parser.py)."""
    def __init__(self):
        self.parse_replay_ret = {}
        self.replay_meta_ret = {}
        self.get_stats_ret = {}

    def parse_replay(self, data_bytes):
        if isinstance(self.parse_replay_ret, Exception):
            raise self.parse_replay_ret
        return self.parse_replay_ret

    def get_replay_meta(self, path_str):
        if isinstance(self.replay_meta_ret, Exception):
            raise self.replay_meta_ret
        return self.replay_meta_ret

    def get_stats(self, path_str, module_names=None):
        if isinstance(self.get_stats_ret, Exception):
            raise self.get_stats_ret
        return self.get_stats_ret


@pytest.fixture
def fake_subtr(monkeypatch):
    """Inyecta un subtr_actor falso en sys.modules y reimporta parser fresco.
    Devuelve (parser_module, fake)."""
    fake = FakeSubtr()
    mod = types.ModuleType("subtr_actor")
    mod.parse_replay = fake.parse_replay
    mod.get_replay_meta = fake.get_replay_meta
    mod.get_stats = fake.get_stats
    monkeypatch.setitem(sys.modules, "subtr_actor", mod)
    monkeypatch.delitem(sys.modules, "parser", raising=False)
    import parser as parser_mod
    return parser_mod, fake


@pytest.fixture
def fake_replay_file(tmp_path):
    """Crea un .replay ficticio (el fake ignora los bytes) para que exista en disco."""
    p = tmp_path / "match.replay"
    p.write_bytes(b"FAKE_REPLAY_BYTES")
    return str(p)


@pytest.fixture
def frames_cache_tmp(tmp_path, monkeypatch):
    """Repunta FRAMES_CACHE_DIR a un tmp para no escribir caché real."""
    import replay_frames
    d = tmp_path / "frames"
    d.mkdir()
    monkeypatch.setattr(replay_frames, "FRAMES_CACHE_DIR", str(d))
    return d
