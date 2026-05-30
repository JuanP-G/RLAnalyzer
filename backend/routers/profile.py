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

# Lee la key del .env; si no existe, lee directamente del archivo como fallback
def _load_api_key():
    key = os.getenv("TRACKER_API_KEY", "")
    if key:
        return key
    # Fallback: leer .env directamente (por si el proceso no cargó las vars de entorno)
    # __file__ = backend/routers/profile.py → dirname×2 = backend/ → .env = backend/.env
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    if not os.path.exists(env_path):
        env_path = os.path.join(os.path.dirname(__file__), ".env")
    try:
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("TRACKER_API_KEY="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return ""

TRACKER_API_KEY  = _load_api_key()
CACHE_TTL        = 600   # 10 min — refresca si hay conexión
BLOCKED_TTL      = 1800  # 30 min — si tracker.gg devuelve 403/429, no volver a intentar hasta pasado este tiempo

_DATA_DIR     = os.path.join(BASE_DIR, "data")
_PROFILE_FILE = os.path.join(_DATA_DIR, "profile_cache.json")
_HISTORY_FILE = os.path.join(_DATA_DIR, "history_cache.json")
os.makedirs(_DATA_DIR, exist_ok=True)

_mem_profile      = {"data": None, "ts": 0}
_mem_history      = {"data": None, "ts": 0}
_api_blocked_until = 0  # bloquea solo la API (403/429); el scraping sigue disponible
_last_playlist_raw = None  # último segmento playlist crudo (diagnóstico de rank/percentile)

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

def _extract_json_at(text: str, marker: str) -> str | None:
    """
    Extrae el primer objeto JSON completo que aparece tras `marker` en `text`.
    Usa balance de llaves en lugar de regex, por lo que funciona con JSON grande/anidado.
    """
    idx = text.find(marker)
    if idx == -1:
        return None
    start = text.find('{', idx)
    if start == -1:
        return None
    depth = 0
    in_str = False
    escape = False
    for i in range(start, len(text)):
        c = text[i]
        if escape:
            escape = False
            continue
        if c == '\\' and in_str:
            escape = True
            continue
        if c == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    return None


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

    # ── Intento 1: Next.js __NEXT_DATA__ (script tag con id) ─────────────────
    m = re.search(
        r'<script[^>]*id=["\']__NEXT_DATA__["\'][^>]*>\s*(\{.*?\})\s*</script>',
        html, re.DOTALL | re.IGNORECASE,
    )
    if m:
        try:
            found = _find_segments(json.loads(m.group(1)))
            if found:
                logger.info("Datos en __NEXT_DATA__")
                return _parse({"data": found})
        except Exception as e:
            logger.debug(f"__NEXT_DATA__ error: {e}")

    # ── Intento 2: window.__INITIAL_STATE__ ─────────────────────────────────
    # Estructura conocida de tracker.gg: { stats: { segments: [...], standardProfiles: [...] } }
    raw = _extract_json_at(html, "window.__INITIAL_STATE__")
    if raw:
        try:
            obj = json.loads(raw)
            stats = obj.get("stats", {})
            segments = stats.get("segments") or []

            if segments:
                # Extraer platformInfo desde standardProfiles
                profiles = stats.get("standardProfiles") or []
                pi = {}
                if profiles and isinstance(profiles[0], dict):
                    p = profiles[0]
                    pi = {
                        "platformUserHandle": p.get("platformUserHandle") or p.get("platformUserIdentifier") or p.get("handle"),
                        "avatarUrl":          p.get("avatarUrl"),
                        "platformSlug":       p.get("platformSlug") or TRACKER_PLATFORM,
                    }
                logger.info(f"Datos en __INITIAL_STATE__.stats.segments ({len(segments)} segmentos)")
                return _parse({"data": {"segments": segments, "platformInfo": pi, "metadata": {}}})

            # Fallback: buscar segments en cualquier parte del objeto
            found = _find_segments(obj)
            if found:
                logger.info("Datos en __INITIAL_STATE__ (búsqueda recursiva)")
                return _parse({"data": found})
        except Exception as e:
            logger.debug(f"__INITIAL_STATE__ parse error: {e}")

    # ── Intento 3: cualquier script inline que contenga "segments" ──────────── # noqa
    for script_content in re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL):
        if '"segments"' not in script_content:
            continue
        for marker in ('window.__TRN_PROFILE__', 'window.__data__', 'var trn=', 'var profile='):
            raw = _extract_json_at(script_content, marker.split('=')[0])
            if raw:
                try:
                    found = _find_segments(json.loads(raw))
                    if found:
                        logger.info(f"Datos en script con marker '{marker}'")
                        return _parse({"data": found})
                except Exception:
                    pass
        # Último recurso: buscar el primer objeto JSON grande del script
        raw = _extract_json_at(script_content, '{')
        if raw and len(raw) > 5000:
            try:
                found = _find_segments(json.loads(raw))
                if found:
                    logger.info("Datos en script inline (búsqueda amplia)")
                    return _parse({"data": found})
            except Exception:
                pass

    logger.warning("Scraping HTTP: sin datos de perfil en el HTML (estructura no reconocida)")
    return None


def _scrape_headless(username: str):
    """
    Fallback con Chromium headless (Playwright).
    Navega la página real y captura la llamada que el sitio hace a api.tracker.gg,
    que sí incluye las cookies de sesión necesarias para obtener datos.

    Requiere instalación previa:
        pip install playwright
        python -m playwright install chromium
    """
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
    except ImportError:
        logger.info("Playwright no instalado — headless scraping no disponible")
        return None

    url = (
        f"https://rocketleague.tracker.network/rocket-league/profile"
        f"/{TRACKER_PLATFORM}/{quote(username)}/overview"
    )
    logger.info(f"Playwright headless: {url}")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent=_UA,
                viewport={"width": 1280, "height": 800},
            )
            page = context.new_page()

            # Bloquear imágenes/fuentes/vídeos para acelerar carga
            page.route(
                "**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf,ico,mp4,webp}",
                lambda r: r.abort(),
            )

            captured = []

            def on_response(response):
                if (
                    "api.tracker.gg" in response.url
                    and "rocket-league" in response.url
                    and response.status == 200
                ):
                    try:
                        data = response.json()
                        segs = (data.get("data") or {}).get("segments") or []
                        if segs:
                            captured.append(data)
                            logger.info(
                                f"Playwright: capturada API con {len(segs)} segmentos"
                            )
                    except Exception:
                        pass

            page.on("response", on_response)

            try:
                page.goto(url, wait_until="networkidle", timeout=30000)
            except PWTimeout:
                logger.warning("Playwright: networkidle timeout — usando datos capturados")

            browser.close()

        if captured:
            logger.info("Playwright: perfil obtenido correctamente")
            return _parse(captured[0])

        logger.warning("Playwright: sin respuestas API capturadas")
        return None

    except Exception as e:
        logger.warning(f"Playwright error: {e}")
        return None


# ---- Intento de obtener datos frescos de tracker.gg ------------------------

def _fetch_fresh(username):
    """Intenta obtener datos frescos. Devuelve (data, error_msg)."""
    global _api_blocked_until
    now = time.time()
    errors = []

    # 1. API (se salta si fue bloqueada por 403/429, pero el scraping siempre corre)
    if now >= _api_blocked_until:
        try:
            url = (
                f"https://api.tracker.gg/api/v2/rocket-league/standard/profile"
                f"/{TRACKER_PLATFORM}/{quote(username)}"
            )
            data = _parse(_get_json(url))
            logger.info("Perfil obtenido de API")
            _api_blocked_until = 0  # Éxito — resetear bloqueo
            return data, None
        except HTTPError as e:
            logger.info(f"API HTTP {e.code}")
            errors.append(f"API HTTP {e.code}")
            if e.code == 429:
                # Rate limit — esperar antes de reintentar
                _api_blocked_until = now + BLOCKED_TTL
                logger.warning(f"Rate limit 429 — no reintentando API por {BLOCKED_TTL//60} min")
            elif e.code == 403:
                # 403 puede ser key no aprobada (permanente) o sin key — no bloquear,
                # solo dejar que el scraping lo intente en cada request
                logger.warning("API 403 — key no aprobada o sin key, usando scraping como fallback")
        except Exception as e:
            logger.info(f"API error: {e}")
            errors.append(f"API: {e}")
    else:
        mins = int((_api_blocked_until - now) / 60) + 1
        logger.info(f"API bloqueada, saltando (reintenta en ~{mins} min)")
        errors.append(f"API bloqueada (~{mins} min)")

    # 2. Web scraping HTTP — rápido, falla si el sitio carga datos via JS
    try:
        data = _scrape(username)
        if data:
            logger.info("Perfil obtenido por scraping HTTP")
            return data, None
        errors.append("Scraping HTTP: sin datos en HTML")
    except Exception as e:
        logger.warning(f"Scraping HTTP error: {e}")
        errors.append(f"Scraping HTTP: {e}")

    # 3. Playwright headless — navega con Chromium real, captura la API del sitio
    try:
        data = _scrape_headless(username)
        if data:
            logger.info("Perfil obtenido por Playwright headless")
            _disk_save(_PROFILE_FILE, data)  # cachear en disco para próximas cargas
            return data, None
        errors.append("Playwright: sin datos (¿no instalado?)")
    except Exception as e:
        logger.warning(f"Playwright error en fetch: {e}")
        errors.append(f"Playwright: {e}")

    return None, " | ".join(errors) or "tracker.gg no disponible"


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
        "Si tienes API key, ponla en backend/.env como: TRACKER_API_KEY=tu-key"
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
            "divisionDown_raw":   stats.get("divisionDown"),
            "divisionUp_raw":     stats.get("divisionUp"),
            "division_metadata":  (stats.get("division", {}) or {}).get("metadata"),
            "rank_raw":           stats.get("rank"),
            "percentile_raw":     stats.get("percentile"),
            "rating_raw":         stats.get("rating", {}).get("value"),
        })
    return {"playlists": results}


@router.get("/profile/raw-sample")
def profile_raw_sample():
    """
    Diagnóstico: devuelve el primer segmento 'playlist' tal cual lo entrega tracker.gg
    (incluido el camino de Playwright/scraping). Sirve para localizar dónde vienen
    el rank global y el percentil 'Top X%'.
    Abre /api/profile primero (para poblarlo) y luego /api/profile/raw-sample.
    """
    if _last_playlist_raw is None:
        return {"note": "Sin datos aún. Abre /api/profile primero y vuelve a recargar esto."}
    return {
        "playlist_name": _last_playlist_raw.get("metadata", {}).get("name"),
        "stat_keys":     list((_last_playlist_raw.get("stats") or {}).keys()),
        "stats":         _last_playlist_raw.get("stats"),
    }


@router.get("/profile/diagnose")
def diagnose_profile():
    """
    Diagnóstico completo del sistema de perfil.
    Hace llamadas reales a tracker.gg y muestra el error exacto sin afectar la caché.
    Llama a http://localhost:8000/api/profile/diagnose para ver qué está fallando.
    """
    import socket
    result = {
        "api_key_loaded":     bool(TRACKER_API_KEY),
        "api_key_prefix":     TRACKER_API_KEY[:6] + "..." if TRACKER_API_KEY else "(ninguna)",
        "player_name":        PLAYER_NAME,
        "platform":           TRACKER_PLATFORM,
        "api_blocked_until":  _api_blocked_until,
        "api_blocked_active": time.time() < _api_blocked_until,
        "disk_cache_exists":  os.path.exists(_PROFILE_FILE),
        "disk_cache_bytes":   os.path.getsize(_PROFILE_FILE) if os.path.exists(_PROFILE_FILE) else 0,
    }

    # Test de conectividad básica
    try:
        socket.setdefaulttimeout(5)
        socket.socket(socket.AF_INET, socket.SOCK_STREAM).connect(("api.tracker.gg", 443))
        result["internet_ok"] = True
    except Exception as e:
        result["internet_ok"] = False
        result["internet_error"] = str(e)

    # Test API sin key — a veces funciona con headers de navegador puro
    api_url_nokey = (
        f"https://api.tracker.gg/api/v2/rocket-league/standard/profile"
        f"/{TRACKER_PLATFORM}/{quote(PLAYER_NAME)}"
    )
    try:
        req = Request(api_url_nokey, headers={
            "User-Agent": _UA,
            "Accept": "application/json",
            "Referer": "https://rocketleague.tracker.network/",
        })
        with urlopen(req, timeout=15) as r:
            d = json.loads(r.read().decode())
        result["api_nokey_status"] = "OK"
        result["api_nokey_segments"] = len(d.get("data", {}).get("segments", []))
    except HTTPError as e:
        result["api_nokey_status"] = f"HTTP {e.code}"
        try:
            result["api_nokey_error"] = e.read().decode("utf-8", "replace")[:200]
        except Exception:
            pass
    except Exception as e:
        result["api_nokey_status"] = f"Error: {e}"

    # Test API directo — muestra el error HTTP exacto
    api_url = (
        f"https://api.tracker.gg/api/v2/rocket-league/standard/profile"
        f"/{TRACKER_PLATFORM}/{quote(PLAYER_NAME)}"
    )
    result["api_url"] = api_url
    try:
        data = _get_json(api_url)
        result["api_status"] = "OK"
        result["api_segments"] = len(data.get("data", {}).get("segments", []))
    except HTTPError as e:
        result["api_status"] = f"HTTP {e.code} {e.reason}"
        try:
            body = e.read().decode("utf-8", errors="replace")[:400]
            result["api_error_body"] = body
        except Exception:
            pass
    except Exception as e:
        result["api_status"] = f"Error: {type(e).__name__}: {e}"

    # Test scraping — inspección profunda de la estructura del HTML
    scrape_url = (
        f"https://rocketleague.tracker.network/rocket-league/profile"
        f"/{TRACKER_PLATFORM}/{quote(PLAYER_NAME)}/overview"
    )
    result["scrape_url"] = scrape_url
    try:
        html = _get_html(scrape_url)
        result["scrape_bytes"] = len(html)
        result["scrape_has_next_data"]     = "__NEXT_DATA__" in html
        result["scrape_has_initial_state"] = "__INITIAL_STATE__" in html

        # Inspeccionar __INITIAL_STATE__ en detalle
        raw = _extract_json_at(html, "window.__INITIAL_STATE__")
        if raw:
            result["initial_state_extracted_len"] = len(raw)
            try:
                obj = json.loads(raw)
                stats_obj = obj.get("stats", {})
                segments  = stats_obj.get("segments") or []
                profiles  = stats_obj.get("standardProfiles") or []
                result["initial_state_stats_segments_count"]  = len(segments)
                result["initial_state_stats_profiles_count"]  = len(profiles)
                result["initial_state_stats_segments_sample"] = segments[:1]   # primer segmento si existe
                result["initial_state_stats_profiles_sample"] = profiles[:1]   # primer perfil si existe
            except Exception as e:
                result["initial_state_parse_error"] = str(e)

        # Scripts inline que contienen "segments"
        scripts_with_segments = []
        for i, s in enumerate(re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)):
            if '"segments"' in s:
                scripts_with_segments.append({"script_index": i, "length": len(s), "snippet": s[:150]})
        result["scripts_with_segments"] = scripts_with_segments[:5]

        data = _scrape(PLAYER_NAME)
        result["scrape_status"] = "OK — datos encontrados" if data else "FAIL — sin datos en HTML"
    except Exception as e:
        result["scrape_status"] = f"Error: {type(e).__name__}: {e}"

    return result


@router.post("/profile/invalidate")
def invalidate_profile():
    """Borra cache en memoria y en disco para forzar refresco completo."""
    global _mem_profile, _mem_history, _api_blocked_until
    _mem_profile = {"data": None, "ts": 0}
    _mem_history = {"data": None, "ts": 0}
    _api_blocked_until = 0  # permite reintentar la API inmediatamente
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


def _first(*vals):
    """Primer valor que no sea None (0 es válido)."""
    for v in vals:
        if v is not None:
            return v
    return None


def _parse(raw):
    global _last_playlist_raw
    d    = raw.get("data", {})
    pi   = d.get("platformInfo", {})
    meta = d.get("metadata", {})
    segs = d.get("segments", [])

    # Diagnóstico: guarda el primer segmento playlist tal cual (para localizar rank/percentile)
    try:
        _last_playlist_raw = (
            next((s for s in segs if s.get("type") == "playlist" and
                  s.get("metadata", {}).get("currentSeason")), None)
            or next((s for s in segs if s.get("type") == "playlist"), None)
        )
    except Exception:
        pass

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
        # La racha trae el valor en positivo (magnitud) y el signo en metadata.type
        ws_val  = _s(stats, "winStreak", "value")
        ws_type = _s(stats, "winStreak", "metadata", "type")  # "win" | "loss"
        if ws_val is not None and ws_type == "loss":
            ws_val = -abs(ws_val)
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
            "winStreak":     ws_val,
            "wins":          _s(stats, "wins",          "value"),
            "winPct":        _s(stats, "winPercentage", "displayValue"),
            "winPctVal":     _s(stats, "winPercentage", "value"),
            # MMR para bajar/subir de división: en division.metadata.deltaDown/deltaUp
            "divisionDown":  _first(_s(div, "metadata", "deltaDown"), _s(stats, "divisionDown", "value")),
            "divisionUp":    _first(_s(div, "metadata", "deltaUp"),   _s(stats, "divisionUp",   "value")),
            # Rank global y percentil de habilidad: ambos en stats.rating (rating.rank /
            # rating.percentile). OJO: tier/division/matchesPlayed tienen su PROPIO
            # percentile, que NO es el ranking de skill — por eso hay que ser explícito.
            "globalRank":    _first(_s(stats, "rating", "rank"), _s(stats, "rank", "value")),
            "percentile":    _first(_s(stats, "rating", "percentile"), _s(stats, "percentile", "value")),
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
