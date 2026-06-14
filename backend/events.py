"""
events.py — RLAnalyzer
Validación de partidas y registro en memoria de los replays rechazados (corruptos /
no-partidas), para que el frontend pueda notificarlos.
"""
import time
from collections import deque

_rejected: deque = deque(maxlen=50)
_seq = 0


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


def add_rejected(file_name: str):
    """Registra un replay rechazado (para notificar)."""
    global _seq
    _seq += 1
    _rejected.append({"seq": _seq, "file_name": file_name or "?", "ts": time.time()})


def recent_rejected(since: int = 0):
    """Rechazos con seq > since (lo que el frontend aún no ha notificado)."""
    return [e for e in _rejected if e["seq"] > since]


def last_seq() -> int:
    return _seq
