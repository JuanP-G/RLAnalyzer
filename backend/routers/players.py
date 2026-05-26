"""
routers/players.py — RLAnalyzer
Historial de partidas con/contra un jugador específico.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import Optional

from database import get_db
from models import Replay, PlayerStat

router = APIRouter(prefix="/api", tags=["players"])


def _avg(values):
    vals = [v for v in values if v is not None]
    return round(sum(vals) / len(vals), 2) if vals else None


def _group_stats(rows):
    """Calcula stats de un grupo de (PlayerStat_mio, PlayerStat_ellos, Replay)."""
    wins   = sum(1 for _, _, r in rows if r.result == "win")
    losses = sum(1 for _, _, r in rows if r.result == "loss")
    games  = len(rows)
    return {
        "games":    games,
        "wins":     wins,
        "losses":   losses,
        "win_rate": round(wins / games * 100, 1) if games else 0,
        "my_avg": {
            "goals":    _avg([me.goals    for me, _, _ in rows]),
            "assists":  _avg([me.assists  for me, _, _ in rows]),
            "saves":    _avg([me.saves    for me, _, _ in rows]),
            "shots":    _avg([me.shots    for me, _, _ in rows]),
            "score":    _avg([me.score    for me, _, _ in rows]),
            "avg_speed":_avg([me.avg_speed for me, _, _ in rows]),
        },
        "their_avg": {
            "goals":    _avg([th.goals    for _, th, _ in rows if th]),
            "assists":  _avg([th.assists  for _, th, _ in rows if th]),
            "saves":    _avg([th.saves    for _, th, _ in rows if th]),
            "shots":    _avg([th.shots    for _, th, _ in rows if th]),
            "score":    _avg([th.score    for _, th, _ in rows if th]),
            "avg_speed":_avg([th.avg_speed for _, th, _ in rows if th]),
        },
    }


def _replay_dict(r: Replay) -> dict:
    return {
        "id":          r.id,
        "file_name":   r.file_name,
        "map_name":    r.map_name,
        "team_size":   r.team_size,
        "match_type":  r.match_type,
        "duration_secs": r.duration_secs,
        "played_at":   r.played_at.isoformat() if r.played_at else None,
        "result":      r.result,
        "team0_score": r.team0_score,
        "team1_score": r.team1_score,
        "my_team":     r.my_team,
        "is_favorite": bool(r.is_favorite),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/players")
def list_players(q: str = "", db: Session = Depends(get_db)):
    """
    Lista de todos los jugadores vistos en replays (sin el jugador principal).
    Ordenados por nº de apariciones descendente.
    """
    query = (
        db.query(
            PlayerStat.player_name,
            func.count(PlayerStat.id).label("games"),
            func.max(Replay.played_at).label("last_seen"),
        )
        .join(Replay, PlayerStat.replay_id == Replay.id)
        .filter(PlayerStat.is_me == False)
        .group_by(PlayerStat.player_name)
    )
    if q:
        query = query.filter(PlayerStat.player_name.ilike(f"%{q}%"))

    rows = query.order_by(desc("games")).limit(100).all()
    return {
        "players": [
            {
                "name":      r.player_name,
                "games":     r.games,
                "last_seen": r.last_seen.isoformat() if r.last_seen else None,
            }
            for r in rows
        ]
    }


@router.get("/players/{player_name}/summary")
def get_player_summary(player_name: str, db: Session = Depends(get_db)):
    """
    Record completo con/contra un jugador:
    - cuántas partidas juntos vs contra
    - win rate en cada caso
    - medias de mis stats y las suyas
    """
    # Todas las apariciones de ese jugador (con el replay y mi stat en ese replay)
    rows = (
        db.query(PlayerStat, Replay)
        .join(Replay, PlayerStat.replay_id == Replay.id)
        .filter(PlayerStat.player_name == player_name)
        .filter(PlayerStat.is_me == False)
        .order_by(desc(Replay.played_at))
        .all()
    )

    if not rows:
        return {"player_name": player_name, "total_games": 0, "with": None, "against": None}

    # Para cada aparición, buscar mi stat en el mismo replay
    replay_ids = [r.id for _, r in rows]
    my_stats_map = {
        ps.replay_id: ps
        for ps in db.query(PlayerStat)
            .filter(PlayerStat.replay_id.in_(replay_ids))
            .filter(PlayerStat.is_me == True)
            .all()
    }

    with_me     = []  # (mi_stat, su_stat, replay)
    against_me  = []

    for their_stat, replay in rows:
        me = my_stats_map.get(replay.id)
        entry = (me, their_stat, replay)
        if their_stat.team == replay.my_team:
            with_me.append(entry)
        else:
            against_me.append(entry)

    dates = [r.played_at for _, r in rows if r.played_at]

    return {
        "player_name": player_name,
        "total_games": len(rows),
        "first_seen":  min(dates).isoformat() if dates else None,
        "last_seen":   max(dates).isoformat() if dates else None,
        "with":        _group_stats(with_me)    if with_me    else None,
        "against":     _group_stats(against_me) if against_me else None,
    }


@router.get("/players/{player_name}/replays")
def get_player_replays(
    player_name: str,
    context: Optional[str] = None,   # "with" | "against" | None (todos)
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """
    Lista de replays donde aparece el jugador.
    context=with → solo partidas juntos
    context=against → solo partidas contra
    """
    rows = (
        db.query(PlayerStat, Replay)
        .join(Replay, PlayerStat.replay_id == Replay.id)
        .filter(PlayerStat.player_name == player_name)
        .filter(PlayerStat.is_me == False)
        .order_by(desc(Replay.played_at))
        .all()
    )

    filtered = []
    for their_stat, replay in rows:
        together = their_stat.team == replay.my_team
        if context == "with" and not together:
            continue
        if context == "against" and together:
            continue
        filtered.append((their_stat, replay))

    total  = len(filtered)
    paged  = filtered[skip:skip + limit]

    replay_ids  = [r.id for _, r in paged]
    my_stats_map = {
        ps.replay_id: ps
        for ps in db.query(PlayerStat)
            .filter(PlayerStat.replay_id.in_(replay_ids))
            .filter(PlayerStat.is_me == True)
            .all()
    }

    result = []
    for their_stat, replay in paged:
        d = _replay_dict(replay)
        me = my_stats_map.get(replay.id)
        d["context"]    = "with" if their_stat.team == replay.my_team else "against"
        d["their_stats"] = {
            "goals": their_stat.goals, "assists": their_stat.assists,
            "saves": their_stat.saves, "score":   their_stat.score,
        }
        d["my_stats"] = {
            "goals": me.goals if me else None, "assists": me.assists if me else None,
            "saves": me.saves if me else None, "score":   me.score   if me else None,
        } if me else None
        result.append(d)

    return {"total": total, "replays": result}
