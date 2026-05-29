"""
routers/stats.py — RLAnalyzer
Análisis avanzado de comportamiento:
  - Cómo cambian tus medias entre victorias y derrotas.
  - Cómo te comparas con tus compañeros y tus rivales.
  - Evolución de tus stats a lo largo del tiempo.
Todo segmentable por modo (1v1/2v2/3v3), categoría (Ranked/Casual/Extra) y fechas.

Partidas anómalas:
  Para el ANÁLISIS de comportamiento se pueden excluir partidas que no son
  representativas (rendiciones tempranas o palizas), porque distorsionan las
  medias. El WIN RATE y el recuento de partidas SIEMPRE usan todas las partidas.

Endpoints:
  GET /api/stats/analysis/filters  → opciones disponibles para filtrar
  GET /api/stats/analysis          → datos agregados (comparativa + victorias/derrotas)
  GET /api/stats/trend             → evolución temporal por semana/mes
"""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Replay, PlayerStat

router = APIRouter(prefix="/api", tags=["stats"])

# Umbrales por defecto para detectar partidas anómalas
DEFAULT_MIN_DURATION = 180   # segundos — por debajo se considera rendición / incompleta
DEFAULT_MAX_GOAL_DIFF = 5    # diferencia de goles — a partir de aquí es una paliza

# Etiquetas de origen del dato (para el glosario de la UI)
SRC_HEADER = "Cabecera del replay"
SRC_ADV    = "Stats avanzadas (subtr-actor)"


# ── Definición de métricas ─────────────────────────────────────────────────────
# key            campo (o derivada) que se promedia
# label          texto para la UI
# group          offense | defense | boost | movement
# higher_better  True = más es mejor · False = menos es mejor · None = neutral
# unit           ""  ·  "%"  ·  "s"
# desc           explicación para el glosario
# source         de dónde sale el dato
METRICS = [
    # Ofensiva
    {"key": "score",           "label": "Puntuación",          "group": "offense",  "higher_better": True,  "unit": "",
     "desc": "Puntos del marcador del juego: goles, asistencias, paradas, centros, etc.", "source": SRC_HEADER},
    {"key": "goals",           "label": "Goles",               "group": "offense",  "higher_better": True,  "unit": "",
     "desc": "Goles marcados en la partida.", "source": SRC_HEADER},
    {"key": "assists",         "label": "Asistencias",         "group": "offense",  "higher_better": True,  "unit": "",
     "desc": "Pases que terminan en gol de un compañero.", "source": SRC_HEADER},
    {"key": "shots",           "label": "Tiros",               "group": "offense",  "higher_better": True,  "unit": "",
     "desc": "Tiros a puerta realizados.", "source": SRC_HEADER},
    {"key": "shooting_pct",    "label": "% Acierto de tiro",   "group": "offense",  "higher_better": True,  "unit": "%",
     "desc": "Goles ÷ tiros × 100. Eficacia de cara a portería.", "source": SRC_HEADER + " (derivado)"},
    # Defensa
    {"key": "saves",           "label": "Paradas",             "group": "defense",  "higher_better": True,  "unit": "",
     "desc": "Despejes que evitan un gol del rival.", "source": SRC_HEADER},
    # Boost
    {"key": "avg_boost",       "label": "Boost medio",         "group": "boost",    "higher_better": True,  "unit": "",
     "desc": "Indicador del boost que sueles mantener disponible (integral de boost en el tiempo). Más alto = mejor gestión.", "source": SRC_ADV},
    {"key": "boost_collected", "label": "Boost recogido",      "group": "boost",    "higher_better": True,  "unit": "",
     "desc": "Boost total recogido de pads y bidones.", "source": SRC_ADV},
    {"key": "boost_stolen",    "label": "Boost robado",        "group": "boost",    "higher_better": True,  "unit": "",
     "desc": "Boost recogido en el lado del campo rival.", "source": SRC_ADV},
    {"key": "boost_wasted",    "label": "Boost gastado",       "group": "boost",    "higher_better": None,  "unit": "",
     "desc": "Boost consumido durante la partida.", "source": SRC_ADV},
    # Movimiento / posicionamiento
    {"key": "avg_speed",       "label": "Velocidad media",     "group": "movement", "higher_better": True,  "unit": "",
     "desc": "Velocidad media en km/h (supersónico ≈ 79 km/h).", "source": SRC_ADV},
    {"key": "time_supersonic", "label": "T. supersónico",      "group": "movement", "higher_better": True,  "unit": "s",
     "desc": "Segundos a velocidad máxima (supersónica).", "source": SRC_ADV},
    {"key": "time_slow",       "label": "T. a baja velocidad", "group": "movement", "higher_better": False, "unit": "s",
     "desc": "Segundos parado o a velocidad baja.", "source": SRC_ADV},
    {"key": "time_on_ground",  "label": "T. en el suelo",      "group": "movement", "higher_better": None,  "unit": "s",
     "desc": "Segundos con el coche en el suelo.", "source": SRC_ADV},
    {"key": "time_low_air",    "label": "T. aire bajo",        "group": "movement", "higher_better": None,  "unit": "s",
     "desc": "Segundos en el aire a baja altura.", "source": SRC_ADV},
    {"key": "time_high_air",   "label": "T. aire alto",        "group": "movement", "higher_better": True,  "unit": "s",
     "desc": "Segundos en el aire a gran altura (juego aéreo).", "source": SRC_ADV},
    {"key": "total_distance",  "label": "Distancia recorrida", "group": "movement", "higher_better": True,  "unit": "",
     "desc": "Distancia total recorrida (unidades del juego).", "source": SRC_ADV},
]


def _metric_value(stat: PlayerStat, key: str):
    """Devuelve el valor de la métrica para un jugador (incluye derivadas)."""
    if key == "shooting_pct":
        shots = stat.shots or 0
        if shots <= 0:
            return None
        return (stat.goals or 0) / shots * 100.0
    return getattr(stat, key, None)


def _avg(values):
    vals = [v for v in values if v is not None]
    return round(sum(vals) / len(vals), 2) if vals else None


def _is_abnormal(r: Replay, min_duration: int, max_goal_diff: int) -> bool:
    """Una partida es anómala si es demasiado corta (rendición) o una paliza."""
    if r.duration_secs is not None and r.duration_secs < min_duration:
        return True
    if r.team0_score is not None and r.team1_score is not None:
        if abs(r.team0_score - r.team1_score) >= max_goal_diff:
            return True
    return False


def _parse_date(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        try:
            return datetime.strptime(s, "%Y-%m-%d")
        except ValueError:
            return None


def _filtered_replays(db, team_size, category, date_from, date_to):
    q = db.query(Replay)
    if team_size is not None:
        q = q.filter(Replay.team_size == team_size)
    if category:
        q = q.filter(Replay.game_category == category)
    df = _parse_date(date_from)
    dt = _parse_date(date_to)
    if df is not None:
        q = q.filter(Replay.played_at >= df)
    if dt is not None:
        # incluir todo el día final si solo viene la fecha
        q = q.filter(Replay.played_at < dt + timedelta(days=1))
    return q.all()


# ── Endpoints ───────────────────────────────────────────────────────────────────

@router.get("/stats/analysis/filters")
def analysis_filters(db: Session = Depends(get_db)):
    """Opciones disponibles para los desplegables de filtro (con nº de partidas)."""
    sizes = (
        db.query(Replay.team_size, func.count(Replay.id))
        .filter(Replay.team_size.isnot(None))
        .group_by(Replay.team_size)
        .order_by(Replay.team_size)
        .all()
    )
    cats = (
        db.query(Replay.game_category, func.count(Replay.id))
        .filter(Replay.game_category.isnot(None))
        .group_by(Replay.game_category)
        .all()
    )
    drange = db.query(func.min(Replay.played_at), func.max(Replay.played_at)).first()
    return {
        "team_sizes": [{"value": s, "games": c} for s, c in sizes],
        "categories": [{"value": cat, "games": c} for cat, c in cats],
        "total": db.query(Replay).count(),
        "date_min": drange[0].isoformat() if drange and drange[0] else None,
        "date_max": drange[1].isoformat() if drange and drange[1] else None,
        "defaults": {
            "min_duration": DEFAULT_MIN_DURATION,
            "max_goal_diff": DEFAULT_MAX_GOAL_DIFF,
        },
    }


@router.get("/stats/glossary")
def glossary():
    """Descripción y origen de cada métrica (para la sección de ayuda)."""
    return {
        "abnormal": {
            "min_duration": DEFAULT_MIN_DURATION,
            "max_goal_diff": DEFAULT_MAX_GOAL_DIFF,
            "desc": (
                "Una partida se considera anómala (y se excluye del análisis, no del "
                "win rate) si dura menos del mínimo de segundos —probable rendición o "
                "partida incompleta— o si la diferencia de goles iguala o supera el "
                "máximo —una paliza poco representativa."
            ),
        },
        "metrics": [
            {k: m[k] for k in ("key", "label", "group", "unit", "higher_better", "desc", "source")}
            for m in METRICS
        ],
    }


@router.get("/stats/analysis")
def analysis(
    team_size: Optional[int] = None,
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    exclude_abnormal: bool = True,
    min_duration: int = DEFAULT_MIN_DURATION,
    max_goal_diff: int = DEFAULT_MAX_GOAL_DIFF,
    db: Session = Depends(get_db),
):
    """
    Agrega tus medias (global / victorias / derrotas) y las de tus compañeros
    y rivales, métrica a métrica, para el set de partidas filtrado.
    El win rate usa todas las partidas; las medias excluyen las anómalas.
    """
    replays = _filtered_replays(db, team_size, category, date_from, date_to)

    # Por métrica y por rol (me/teammates/opponents): listas global/victoria/derrota
    buckets = {
        m["key"]: {role: {"all": [], "win": [], "loss": []}
                   for role in ("me", "teammates", "opponents")}
        for m in METRICS
    }

    games = wins = losses = excluded = 0

    for r in replays:
        me = next((p for p in r.players if p.is_me), None)
        if me is None:
            continue

        games += 1
        is_win  = r.result == "win"
        is_loss = r.result == "loss"
        if is_win:
            wins += 1
        elif is_loss:
            losses += 1

        # ── Las partidas anómalas cuentan para el win rate pero NO para las medias ──
        if exclude_abnormal and _is_abnormal(r, min_duration, max_goal_diff):
            excluded += 1
            continue

        my_team = r.my_team if r.my_team is not None else me.team
        for p in r.players:
            role = "me" if p.is_me else ("teammates" if p.team == my_team else "opponents")
            for m in METRICS:
                v = _metric_value(p, m["key"])
                if v is None:
                    continue
                b = buckets[m["key"]][role]
                b["all"].append(v)
                if is_win:
                    b["win"].append(v)
                elif is_loss:
                    b["loss"].append(v)

    def _split(d):
        return {"overall": _avg(d["all"]), "wins": _avg(d["win"]), "losses": _avg(d["loss"])}

    metrics_out = []
    for m in METRICS:
        b = buckets[m["key"]]
        metrics_out.append({
            **{k: m[k] for k in ("key", "label", "group", "higher_better", "unit", "desc", "source")},
            "me":        _split(b["me"]),
            "teammates": _split(b["teammates"]),
            "opponents": _split(b["opponents"]),
        })

    return {
        "games": games,
        "wins": wins,
        "losses": losses,
        "win_rate": round(wins / games * 100, 1) if games else 0,
        "analyzed_games": games - excluded if exclude_abnormal else games,
        "excluded_abnormal": excluded,
        "filters": {
            "team_size": team_size, "category": category,
            "date_from": date_from, "date_to": date_to,
            "exclude_abnormal": exclude_abnormal,
            "min_duration": min_duration, "max_goal_diff": max_goal_diff,
        },
        "metrics": metrics_out,
    }


@router.get("/stats/trend")
def trend(
    team_size: Optional[int] = None,
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    bucket: str = "week",          # "week" | "month"
    exclude_abnormal: bool = True,
    min_duration: int = DEFAULT_MIN_DURATION,
    max_goal_diff: int = DEFAULT_MAX_GOAL_DIFF,
    db: Session = Depends(get_db),
):
    """
    Evolución temporal: agrupa las partidas por semana o mes y devuelve, por
    periodo, el win rate y la media de cada una de tus métricas. Sirve para ver
    si vas mejorando con el tiempo.
    """
    replays = _filtered_replays(db, team_size, category, date_from, date_to)

    def bucket_key(d: datetime):
        if bucket == "month":
            start = d.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            return start, start.strftime("%m/%Y")
        # semana (lunes como inicio)
        start = (d - timedelta(days=d.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        return start, start.strftime("%d/%m")

    groups: dict = {}  # start_dt -> acumulador

    for r in replays:
        if not r.played_at:
            continue
        me = next((p for p in r.players if p.is_me), None)
        if me is None:
            continue

        start, label = bucket_key(r.played_at)
        g = groups.setdefault(start, {
            "label": label, "games": 0, "wins": 0,
            "metric_vals": {m["key"]: [] for m in METRICS},
        })
        g["games"] += 1
        if r.result == "win":
            g["wins"] += 1

        if exclude_abnormal and _is_abnormal(r, min_duration, max_goal_diff):
            continue
        for m in METRICS:
            v = _metric_value(me, m["key"])
            if v is not None:
                g["metric_vals"][m["key"]].append(v)

    out = []
    for start in sorted(groups.keys()):
        g = groups[start]
        out.append({
            "period": start.isoformat(),
            "label": g["label"],
            "games": g["games"],
            "wins": g["wins"],
            "win_rate": round(g["wins"] / g["games"] * 100, 1) if g["games"] else 0,
            "metrics": {k: _avg(v) for k, v in g["metric_vals"].items()},
        })

    return {
        "bucket": bucket,
        "buckets": out,
        "metric_meta": [
            {k: m[k] for k in ("key", "label", "group", "unit")} for m in METRICS
        ],
    }


@router.get("/stats/dashboard")
def dashboard(
    team_size: Optional[int] = None,
    result: Optional[str] = None,        # "win" | "loss" — afecta KPIs/tarta/tiros, NO la forma reciente
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    bucket: str = "day",                 # "day" | "week"
    exclude_abnormal: bool = True,
    min_duration: int = DEFAULT_MIN_DURATION,
    max_goal_diff: int = DEFAULT_MAX_GOAL_DIFF,
    db: Session = Depends(get_db),
):
    """
    Datos personales para el Dashboard, segmentables por modo, periodo y
    resultado. Devuelve:
      - kpis          recuento + medias (las medias excluyen anómalas)
      - play_style    reparto goles/paradas/asistencias (tarta)
      - shooting      goles vs tiros totales + % de acierto
      - series        evolución por día/semana (goles, tiros, % acierto…)
      - recent_form   últimas partidas como V/D (ignora el filtro de resultado)
    """
    replays = [r for r in _filtered_replays(db, team_size, None, date_from, date_to)
               if r.played_at is not None]
    replays.sort(key=lambda r: r.played_at)

    def me_of(r):
        return next((p for p in r.players if p.is_me), None)

    # ── Forma reciente: respeta modo+periodo pero NO el filtro de resultado ──
    recent = [{
        "id": r.id,
        "result": r.result,
        "map_name": r.map_name,
        "team0_score": r.team0_score,
        "team1_score": r.team1_score,
        "played_at": r.played_at.isoformat(),
    } for r in sorted(replays, key=lambda r: r.played_at, reverse=True)[:15]]
    recent.reverse()  # cronológico: la más reciente al final (a la derecha en la UI)
    recent_wins = sum(1 for x in recent if x["result"] == "win")
    recent_total = len(recent)

    # ── Resto de datos: aplica el filtro de resultado si lo hay ──
    sel = replays
    if result in ("win", "loss"):
        sel = [r for r in sel if r.result == result]

    games  = len(sel)
    wins   = sum(1 for r in sel if r.result == "win")
    losses = sum(1 for r in sel if r.result == "loss")

    def bkey(d: datetime):
        if bucket == "week":
            start = (d - timedelta(days=d.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
            return start, start.strftime("%d/%m")
        start = d.replace(hour=0, minute=0, second=0, microsecond=0)
        return start, start.strftime("%d/%m")

    series: dict = {}
    ps = {"goals": 0, "saves": 0, "assists": 0}
    goals_acc, saves_acc, score_acc = [], [], []
    tot_goals = tot_shots = 0

    for r in sel:
        me = me_of(r)
        if me is None:
            continue
        if exclude_abnormal and _is_abnormal(r, min_duration, max_goal_diff):
            continue
        g  = me.goals   or 0
        s  = me.saves   or 0
        a  = me.assists or 0
        sh = me.shots   or 0
        ps["goals"]   += g
        ps["saves"]   += s
        ps["assists"] += a
        tot_goals += g
        tot_shots += sh
        goals_acc.append(g)
        saves_acc.append(s)
        score_acc.append(me.score or 0)

        start, label = bkey(r.played_at)
        b = series.setdefault(start, {
            "label": label, "goals": 0, "shots": 0, "saves": 0,
            "assists": 0, "games": 0, "wins": 0,
        })
        b["goals"]   += g
        b["shots"]   += sh
        b["saves"]   += s
        b["assists"] += a
        b["games"]   += 1
        if r.result == "win":
            b["wins"] += 1

    series_out = []
    for start in sorted(series.keys()):
        b = series[start]
        series_out.append({
            "date": start.isoformat(),
            "label": b["label"],
            "goals": b["goals"], "shots": b["shots"],
            "saves": b["saves"], "assists": b["assists"],
            "games": b["games"], "wins": b["wins"],
            "shooting_pct": round(b["goals"] / b["shots"] * 100, 1) if b["shots"] else None,
        })

    analyzed = len(goals_acc)
    return {
        "filters": {
            "team_size": team_size, "result": result,
            "date_from": date_from, "date_to": date_to, "bucket": bucket,
            "exclude_abnormal": exclude_abnormal,
            "min_duration": min_duration, "max_goal_diff": max_goal_diff,
        },
        "kpis": {
            "games": games, "wins": wins, "losses": losses,
            "win_rate": round(wins / games * 100, 1) if games else 0,
            "analyzed_games": analyzed,
            "avg_goals": round(sum(goals_acc) / analyzed, 2) if analyzed else 0,
            "avg_saves": round(sum(saves_acc) / analyzed, 2) if analyzed else 0,
            "avg_score": round(sum(score_acc) / analyzed, 1) if analyzed else 0,
        },
        "play_style": {"goals": ps["goals"], "saves": ps["saves"], "assists": ps["assists"]},
        "shooting": {
            "goals": tot_goals, "shots": tot_shots,
            "pct": round(tot_goals / tot_shots * 100, 1) if tot_shots else None,
        },
        "bucket": bucket,
        "series": series_out,
        "recent_form": {
            "matches": recent, "wins": recent_wins, "total": recent_total,
            "win_rate": round(recent_wins / recent_total * 100, 1) if recent_total else 0,
        },
    }
