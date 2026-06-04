"""Tests de settings_store (usa la BD de test inyectada por conftest)."""
import pytest

import config
import settings_store

pytestmark = pytest.mark.api  # usa la BD (en memoria) vía SessionLocal parcheado


def test_get_default_when_empty(db):
    settings_store.invalidate()
    assert settings_store.get_player_name() == config.PLAYER_NAME
    assert settings_store.get_replays_folder() == config.REPLAYS_FOLDER


def test_set_and_get(db):
    settings_store.set(settings_store.KEY_PLAYER_NAME, "OtroJugador")
    assert settings_store.get_player_name() == "OtroJugador"


def test_invalidate_reloads_from_db(db):
    settings_store.set(settings_store.KEY_REPLAYS_FOLDER, "C:/Persistida")
    settings_store.invalidate()                       # vacía caché
    assert settings_store.get_replays_folder() == "C:/Persistida"  # recargado de BD
