"""
events.py — RLAnalyzer
Validación de partidas y feed en memoria de notificaciones para la UI:
  - partidas corruptas / no-partidas que NO se añaden a la BD (CORRUPT)
  - nuevas partidas procesadas y añadidas (MATCH_ADDED)
  - replays que no se pudieron leer/parsear (PARSE_ERROR)

Cada aviso lleva un `type`; el frontend lo sondea (GET /api/notifications) y decide si lo
muestra como notificación del sistema según los toggles de Ajustes. Cola acotada en memoria
(no se persiste): los avisos son efímeros, solo importan mientras la app está abierta.
"""
import time
from collections import deque

# Tipos de notificación — deben coincidir con los flags de Ajustes y el switch del frontend.
CORRUPT     = "corrupt"
MATCH_ADDED = "match_added"
PARSE_ERROR = "parse_error"

_events: deque = deque(maxlen=80)
_seq = 0

_RESULT_LABEL = {"win": "Victoria", "loss": "Derrota", "draw": "Empate"}


def is_valid_match(data: dict) -> bool:
    """True si el replay parseado parece una partida real. Un replay corrupto, de
    entrenamiento/freeplay o de menú no tiene mapa ni dos jugadores."""
    if not data:
        return False
    if not data.get("map_name"):
        return False
    if len(data.get("players") or []) < 2:
        return False
    return True


def _push(type_: str, title: str, body: str, **extra) -> dict:
    global _seq
    _seq += 1
    ev = {"seq": _seq, "type": type_, "title": title, "body": body, "ts": time.time()}
    ev.update(extra)
    _events.append(ev)
    return ev


def add_rejected(file_name: str):
    """Registra una partida corrupta/no-partida descartada (no se añade a la BD)."""
    name = file_name or "?"
    _push(CORRUPT, "Partida no añadida", f"Replay corrupto o sin datos: {name}", file_name=name)


def add_match_added(map_name: str, result: str = None, score: str = None):
    """Registra una nueva partida procesada y añadida a la BD."""
    label = _RESULT_LABEL.get(result, "Partida")
    body = f"{map_name or 'Partida'} · {label}"
    if score:
        body += f" {score}"
    _push(MATCH_ADDED, "Nueva partida añadida", body)


def add_parse_error(file_name: str):
    """Registra un replay que no se pudo leer/parsear (distinto de corrupto)."""
    name = file_name or "?"
    _push(PARSE_ERROR, "No se pudo procesar una partida",
          f"Error al leer el replay: {name}", file_name=name)


def recent(since: int = 0):
    """Todos los avisos con seq > since (lo que el frontend aún no ha notificado)."""
    return [e for e in _events if e["seq"] > since]


def recent_rejected(since: int = 0):
    """Solo los avisos de partidas corruptas (compatibilidad con /replays/rejected)."""
    return [e for e in _events if e["seq"] > since and e["type"] == CORRUPT]


def last_seq() -> int:
    return _seq
