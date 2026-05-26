"""
viewer.py — RLAnalyzer
Gestiona el visor 3D de replays:
  - Intenta subir el replay a Ballchasing y devuelve su URL de visor.
  - Usa caché local para no subir dos veces el mismo archivo.

Endpoint:
  GET /api/replays/{replay_id}/ballchasing
  → { status, url, bc_id }
"""

import json
import logging
import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from config import BASE_DIR
from database import get_db
from models import Replay

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["viewer"])

BALLCHASING_API = "https://ballchasing.com/api"
BC_CACHE_PATH   = os.path.join(BASE_DIR, "data", "ballchasing_cache.json")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_bc_token() -> str | None:
    """Lee BALLCHASING_TOKEN de .env o del entorno."""
    env_path = os.path.join(BASE_DIR, ".env")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("BALLCHASING_TOKEN="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return os.environ.get("BALLCHASING_TOKEN")


def _load_cache() -> dict:
    if os.path.exists(BC_CACHE_PATH):
        try:
            with open(BC_CACHE_PATH, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_cache(cache: dict):
    os.makedirs(os.path.dirname(BC_CACHE_PATH), exist_ok=True)
    with open(BC_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2)


def _upload_to_ballchasing(replay_path: str, token: str) -> dict:
    """
    Sube el replay a Ballchasing (o recupera el ID si ya existe, HTTP 409).
    Devuelve {"id": str, "url": str}.
    """
    import requests as req

    with open(replay_path, "rb") as fh:
        resp = req.post(
            f"{BALLCHASING_API}/v2/upload",
            files={"file": (os.path.basename(replay_path), fh, "application/octet-stream")},
            headers={"Authorization": token},
            params={"visibility": "unlisted"},
            timeout=90,
        )

    if resp.status_code in (200, 201):
        data = resp.json()
        bc_id = data["id"]
        return {"id": bc_id, "url": data.get("link", f"https://ballchasing.com/replay/{bc_id}")}

    if resp.status_code == 409:
        # El replay ya existe en Ballchasing con este hash
        data = resp.json()
        bc_id = data.get("id", "")
        return {"id": bc_id, "url": data.get("link", f"https://ballchasing.com/replay/{bc_id}")}

    if resp.status_code == 401:
        raise RuntimeError("Token de Ballchasing inválido o caducado")

    raise RuntimeError(f"Ballchasing HTTP {resp.status_code}: {resp.text[:300]}")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/replays/{replay_id}/ballchasing")
def get_ballchasing(replay_id: int, db: Session = Depends(get_db)):
    """
    Devuelve la URL del visor de Ballchasing para este replay.
    Si no está en caché, intenta subirlo ahora.

    Posibles status:
      "cached"   — URL ya conocida de una subida anterior
      "uploaded" — acabado de subir correctamente
      "no_file"  — archivo .replay no disponible en este equipo
      "no_token" — BALLCHASING_TOKEN no configurado en .env
      "error"    — fallo durante la subida (detalle en "error")
    """
    r = db.query(Replay).filter(Replay.id == replay_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Replay no encontrado")

    # ── Caché hit ─────────────────────────────────────────────────────────────
    cache = _load_cache()
    key   = str(replay_id)
    if key in cache:
        entry = cache[key]
        return {"status": "cached", "url": entry["url"], "bc_id": entry["bc_id"]}

    # ── Sin archivo local → no podemos subir ─────────────────────────────────
    if not r.file_path or not os.path.exists(r.file_path):
        return {"status": "no_file", "url": None, "bc_id": None}

    # ── Sin token → no configurado ────────────────────────────────────────────
    token = _load_bc_token()
    if not token:
        return {"status": "no_token", "url": None, "bc_id": None}

    # ── Subir ─────────────────────────────────────────────────────────────────
    try:
        result = _upload_to_ballchasing(r.file_path, token)
        cache[key] = {
            "bc_id":       result["id"],
            "url":         result["url"],
            "uploaded_at": datetime.now().isoformat(),
        }
        _save_cache(cache)
        logger.info(f"Replay {replay_id} subido a Ballchasing: {result['url']}")
        return {"status": "uploaded", "url": result["url"], "bc_id": result["id"]}
    except Exception as e:
        logger.error(f"Error subiendo replay {replay_id} a Ballchasing: {e}")
        return {"status": "error", "url": None, "bc_id": None, "error": str(e)}
