"""
routers/profile.py - RLAnalyzer
Estrategia de datos del perfil:
  - Conectado: refresca desde tracker.gg y guarda en disco
  - Sin conexion: sirve el ultimo dato guardado en disco (sin expirar)
  - Auto-refresco cada 10 minutos; manual con POST /api/profile/invalidate
"""

import json
import logging
import os
import re
import time
from urllib.request import urlopen, Request
from urllib.error import HTTPError
from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from config import PLAYER_NAME, BASE_DIR

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["profile"])

TRACKER_PLATFORM = "epic"
TRACKER_API_KEY  = ""   # pon aqui tu key de tracker.gg/developers
CACHE_TTL        = 600  # 10 minutos en memoria antes de intentar refrescar

_DATA_DIR     = os.path.join(BASE_DIR, "data")
_PROFILE_FILE = os.path.join(_DATA_DIR, "profile_cache.json")
_HISTORY_FILE = os.path.join(_DATA_DIR, "history_cache.json")
os.makedirs(_DATA_DIR, exist_ok=True)

_mem_profile = {"data": None, "ts": 0}
_mem_history = {"data": None, "ts": 0}

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


# ---- Disco ------------------------------------------------------------------

def _disk_load(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _disk_save(path, data):
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception as e:
        logger.warning(f"No se pudo guardar en disco: {e}")


# ---- HTTP ------------------------------------------------------------------

def _api_headers():
    h = {
        "User-Agent":      _UA,
        "Accept":          "application/json, text/plain, */*",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        "Referer":         "https://rocketleague.tracker.network/",
        "Origin":          "https://rocketleague.tracker.network",
    }
    if TRACKER_API_KEY:
        h["TRN-Api-Key"] = TRACKER_API_KEY
    return h


def _html_headers():
    return {
        "User-Agent":      _UA,
        "Accept":          "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        "Referer":         "https://rocketleague.tracker.network/",
    }


def _get_json(url):
    req = Request(url, headers=_api_headers())
    with urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def _get_html(url):
    req = Request(url, headers=_html_headers())
    with urlopen(req, timeout=20) as r:
        raw = r.read()
        try:
            import gzip
            raw = gzip.decompress(raw)
        except Exception:
            pass
        return raw.decode("utf-8", errors="replace")


# ---- Scraping web (fallback cuando la API bloquea) -------------------------

def _find_segments(obj, depth=0):
    if depth > 12:
        return None
    if isinstance(obj, dict):
        segs = obj.get("segments")
        if isinstance(segs, list) and segs:
            t = segs[0].get("type") if isinstance(segs[0], dict) else None
            if t in ("overview", "playlist"):
                return obj
        for v in obj.values():
            r = _find_segments(v, depth + 1)
            if r:
                return r
    elif isinstance(obj, list):
        for item in obj:
            r = _find_segments(item, depth + 1)
            if r:
                return r
    return None


def _scrape(username):
    url = (
        f"https://rocketleague.tracker.network/rocket-league/profile"
        f"/{TRACKER_PLATFORM}/{quote(username)}/overview"
    )
    logger.info(f"Scraping: {url}")
    try:
        html = _get_html(url)
    except Exception as e:
        logger.warning(f"Scraping red: {e}")
        return None

    logger.info(f"Scraping: {len(html)} bytes")

    # Next.js __NEXT_DATA__
    m = re.search(
        r'<script[^>]*id=["\']__NEXT_DATA__["\'][^>]*>\s*(\{.*?\})\s*</script>',
        html, re.DOTALL | re.IGNORECASE,
    )
    if m:
        try:
            found = _find_segments(json.loads(m.group(1)))
            if found:
                logger.info("Datos encontrados en __NEXT_DATA__")
                return _parse({"data": found})
        except Exception as e:
            logger.debug(f"__NEXT_DATA__ error: {e}")

    # __INITIAL_STATE__
    m2 = re.search(
        r'window\.__INITIAL_STATE__\s*=\s*(\{.+?\})(?:;\s*(?:window|</script))',
        html, re.DOTALL,
    )
    if m2:
        try:
            found = _find_segments(json.loads(m2.group(1)))
            if found:
                logger.info("Datos encontrados en __INITIAL_STATE__")
                return _parse({"data": found})
        except Exception as e:
            logger.debug(f"__INITIAL_STATE__ error: {e}")

    logger.warning("Scraping: sin datos de perfil en el HTML")
    return None


# ---- Intento de obtener datos frescos de tracker.gg ------------------------

def _fetch_fresh(username):
    """Intenta obtener datos frescos. Devuelve (data, error_msg)."""
    # 1. API
    try:
        url = (
            f"https://api.tracker.gg/api/v2/rocket-league/standard/profile"
            f"/{TRACKER_PLATFORM}/{quote(username)}"
        )
        data = _parse(_get_json(url))
        logger.info("Perfil obtenido de API")
        return data, None
    except HTTPError as e:
        logger.info(f"API HTTP {e.code}")
    except Exception as e:
        logger.info(f"API error: {e}")

    # 2. Web scraping
    try:
        data = _scrape(username)
        if data:
            logger.info("Perfil obtenido por scraping")
            return data, None
    except Exception as e:
        logger.warning(f"Scraping error: {e}")

    return None, "tracker.gg no disponible (API bloqueada y scraping sin datos)"


# ---- Endpoints -------------------------------------------------------------

@router.get("/profile")
def get_profile():
    global _mem_profile
    now = time.time()

    # Memoria fresca (< 10 min)
    if _mem_profile["data"] and (now - _mem_profile["ts"]) < CACHE_TTL:
        return _mem_profile["data"]

    # Intentar refrescar desde tracker.gg
    fresh, err = _fetch_fresh(PLAYER_NAME)

    if fresh:
        fresh["_stale"] = False
        _mem_profile = {"data": fresh, "ts": now}
        _disk_save(_PROFILE_FILE, fresh)
        return fresh

    # Sin conexion: servir lo que haya en disco (sin expirar)
    disk = _disk_load(_PROFILE_FILE)
    if disk:
        disk["_stale"]  = True
        disk["_offline"] = True
        logger.info("Perfil desde disco (offline)")
        return disk

    # Sin disco tampoco: error
    raise HTTPException(503, detail=(
        f"{err}. "
        "Cuando se conecte, los datos se guardarán automáticamente para uso offline. "
        "Si tienes API key, ponla en TRACKER_API_KEY en backend/routers/profile.py."
    ))


@router.get("/profile/history")
def get_profile_history():
    global _mem_history
    now = time.time()

    if _mem_history["data"] and (now - _mem_history["ts"]) < CACHE_TTL:
        return _mem_history["data"]

    try:
        url = (
            f"https://api.tracker.gg/api/v2/rocket-league/player-history/mmr"
            f"/{TRACKER_PLATFORM}/{quote(PLAYER_NAME)}"
        )
        data = _get_json(url).get("data", {})
        _mem_history = {"data": data, "ts": now}
        _disk_save(_HISTORY_FILE, data)
        logger.info("Historial MMR obtenido")
        return data
    except Exception as e:
        logger.info(f"History API fallo: {e}")

    disk = _disk_load(_HISTORY_FILE)
    return disk if disk else {}


@router.get("/profile/debug-stats")
def debug_profile_stats():
    """Devuelve las claves raw de stats de cada segmento playlist para diagnosticar campos disponibles."""
    from urllib.parse import quote as _quote
    results = []
    try:
        url = (
            f"https://api.tracker.gg/api/v2/rocket-league/standard/profile"
            f"/{TRACKER_PLATFORM}/{_quote(PLAYER_NAME)}"
        )
        raw = _get_json(url)
    except Exception as e:
        return {"error": str(e), "note": "No se pudo obtener datos de la API"}

    segs = raw.get("data", {}).get("segments", [])
    for seg in segs:
        if seg.get("type") != "playlist":
            continue
        stats = seg.get("stats", {})
        name  = seg.get("metadata", {}).get("name", "?")
        results.append({
            "playlist": name,
            "stat_keys": list(stats.keys()),
            "divisionDown_raw": stats.get("divisionDown"),
            "divisionUp_raw":   stats.get("divisionUp"),
            "rating_raw":       stats.get("rating", {}).get("value"),
        })
    return {"playlists": results}


@router.post("/profile/invalidate")
def invalidate_profile():
    """Borra cache en memoria y en disco para forzar refresco completo."""
    global _mem_profile, _mem_history
    _mem_profile = {"data": None, "ts": 0}
    _mem_history = {"data": None, "ts": 0}
    for f in [_PROFILE_FILE, _HISTORY_FILE]:
        try:
            os.remove(f)
        except FileNotFoundError:
            pass
    return {"ok": True}


# ---- Parseado --------------------------------------------------------------

def _s(d, *keys, default=None):
    try:
        for k in keys:
            d = d[k]
        return d
    except (KeyError, TypeError, IndexError):
        return default


def _parse(raw):
    d    = raw.get("data", {})
    pi   = d.get("platformInfo", {})
    meta = d.get("metadata", {})
    segs = d.get("segments", [])

    overview_seg = next((s for s in segs if s.get("type") == "overview"), None)
    overview = {}
    if overview_seg:
        for k, v in (overview_seg.get("stats") or {}).items():
            overview[k] = {
                "value":        v.get("value"),
                "displayValue": v.get("displayValue"),
                "label":        _s(v, "metadata", "name", default=k),
            }

    ORDER = {10: 0, 11: 1, 13: 2, 27: 3, 28: 4, 29: 5, 30: 6, 34: 7, 0: 8}
    playlists = []
    for seg in segs:
        if seg.get("type") != "playlist":
            continue
        attrs = seg.get("attributes", {})
        smeta = seg.get("metadata", {})
        stats = seg.get("stats", {})
        tier  = stats.get("tier", {})
        div   = stats.get("division", {})
        playlists.append({
            "playlistId":    attrs.get("playlistId"),
            "season":        attrs.get("season"),
            "currentSeason": smeta.get("currentSeason", False),
            "name":          smeta.get("name", ""),
            "tierValue":     tier.get("value"),
            "tierName":      _s(tier, "metadata", "name"),
            "tierIconUrl":   _s(tier, "metadata", "iconUrl"),
            "divisionName":  _s(div,  "metadata", "name"),
            "mmr":           _s(stats, "rating",        "value"),
            "peak":          _s(stats, "peakRating",    "value"),
            "matchesPlayed": _s(stats, "matchesPlayed", "value"),
            "winStreak":     _s(stats, "winStreak",     "value"),
            "wins":          _s(stats, "wins",          "value"),
            "winPct":        _s(stats, "winPercentage", "displayValue"),
            "winPctVal":     _s(stats, "winPercentage", "value"),
            "divisionDown":  _s(stats, "divisionDown",  "value"),
            "divisionUp":    _s(stats, "divisionUp",    "value"),
            "globalRank":    _s(stats, "rank",          "value"),
            "percentile":    _s(stats, "percentile",    "value"),
        })

    current = sorted(
        [p for p in playlists if p.get("currentSeason")],
        key=lambda p: ORDER.get(p.get("playlistId", 99), 99),
    )
    if not current:
        current = sorted(playlists, key=lambda p: ORDER.get(p.get("playlistId", 99), 99))

    lu = meta.get("lastUpdated")
    last_updated = (lu.get("value") or lu.get("displayValue")) if isinstance(lu, dict) else lu

    return {
        "username":      pi.get("platformUserHandle"),
        "avatarUrl":     pi.get("avatarUrl"),
        "platform":      pi.get("platformSlug"),
        "currentSeason": meta.get("currentSeason"),
        "lastUpdated":   last_updated,
        "overview":      overview,
        "playlists":     current,
    }
