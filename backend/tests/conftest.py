"""
Fixtures de pytest para el backend de RLAnalyzer.

Aislamiento total: BD SQLite en memoria (no toca data/rl_data.db), sin red, sin
binarios nativos (subtr_actor/rrrocket), sin watcher ni lifespan. NO se importa
`main` ni `parser` (parser hace `import subtr_actor` a nivel módulo y rompería);
en su lugar se monta una app de test mínima con los routers reales y un override
de `get_db`.
"""
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
def _clean_tables(engine):
    """Limpia las tablas tras cada test (hijos antes que padres por FK)."""
    yield
    with engine.begin() as conn:
        conn.execute(models.PlayerStat.__table__.delete())
        conn.execute(models.Replay.__table__.delete())


@pytest.fixture
def client(db):
    """TestClient sobre una app mínima (sin lifespan) que comparte la sesión `db`."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from routers.replays import router as replays_router
    from routers.stats import router as stats_router
    from routers.players import router as players_router
    from routers.viewer import router as viewer_router

    app = FastAPI()
    for r in (replays_router, stats_router, players_router, viewer_router):
        app.include_router(r)

    def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
