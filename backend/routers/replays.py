"""
routers/replays.py — RLAnalyzer
Endpoints de la API REST para replays y stats.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
from pydantic import BaseModel
import logging

from database import get_db
from models import Replay, PlayerStat

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["replays"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def replay_to_dict(r: Replay, include_players: bool = False) -> dict:
    data = {
        "id":           r.id,
        "file_name":    r.file_name,
        "map_name":     r.map_name,
        "match_type":   r.match_type,
        "team_size":    r.team_size,
        "duration_secs":r.duration_secs,
        "played_at":    r.played_at.isoformat() if r.played_at else None,
        "result":       r.result,
        "my_team":      r.my_team,
        "team0_score":  r.team0_score,
        "team1_score":  r.team1_score,
        "is_solo_queue":  r.is_solo_queue,
        "is_favorite":    bool(r.is_favorite),
        "processed_at": r.processed_at.isoformat() if r.processed_at else None,
    }
    if include_players:
        data["players"] = [player_to_dict(p) for p in r.players]
    return data


def player_to_dict(p: PlayerStat) -> dict:
    return {
        "id":              p.id,
        "player_name":     p.player_name,
        "team":            p.team,
        "is_me":           p.is_me,
        "score":           p.score,
        "goals":           p.goals,
        "assists":         p.assists,
        "saves":           p.saves,
        "shots":           p.shots,
        "demos_inflicted": p.demos_inflicted,
        "boost_collected": p.boost_collected,
        "boost_stolen":    p.boost_stolen,
        "boost_wasted":    p.boost_wasted,
        "avg_boost":       p.avg_boost,
        "avg_speed":       p.avg_speed,
        "time_supersonic": p.time_supersonic,
        "time_boost_speed":p.time_boost_speed,
        "time_slow":       p.time_slow,
        "time_on_ground":  p.time_on_ground,
        "time_low_air":    p.time_low_air,
        "time_high_air":   p.time_high_air,
        "total_distance":  p.total_distance,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/replays")
def list_replays(
    skip: int = 0,
    limit: int = 50,
    result: Optional[str] = None,
    favorite: Optional[int] = None,
    team_size: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Lista de replays, más recientes primero."""
    q = db.query(Replay).order_by(desc(Replay.played_at))
    if result:
        q = q.filter(Replay.result == result)
    if favorite == 1:
        q = q.filter(Replay.is_favorite == True)
    if team_size is not None:
        q = q.filter(Replay.team_size == team_size)
    total = q.count()
    replays = q.offset(skip).limit(limit).all()
    return {
        "total": total,
        "replays": [replay_to_dict(r) for r in replays],
    }


class FavoritePayload(BaseModel):
    value: bool


@router.patch("/replays/{replay_id}/favorite")
def set_favorite(replay_id: int, body: FavoritePayload, db: Session = Depends(get_db)):
    """Marca o desmarca un replay como favorito."""
    r = db.query(Replay).filter(Replay.id == replay_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Replay no encontrado")
    r.is_favorite = body.value
    db.commit()
    return {"id": replay_id, "is_favorite": r.is_favorite}


@router.get("/replays/{replay_id}")
def get_replay(replay_id: int, db: Session = Depends(get_db)):
    """Detalle completo de un replay con todos los jugadores."""
    r = db.query(Replay).filter(Replay.id == replay_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Replay no encontrado")
    return replay_to_dict(r, include_players=True)


@router.get("/stats/summary")
def get_summary(db: Session = Depends(get_db)):
    """Stats globales del jugador principal para el Dashboard."""
    from sqlalchemy import func

    total     = db.query(Replay).count()
    wins      = db.query(Replay).filter(Replay.result == "win").count()
    losses    = db.query(Replay).filter(Replay.result == "loss").count()

    # Stats medias de mi jugador
    me = (
        db.query(
            func.avg(PlayerStat.goals).label("avg_goals"),
            func.avg(PlayerStat.assists).label("avg_assists"),
            func.avg(PlayerStat.saves).label("avg_saves"),
            func.avg(PlayerStat.shots).label("avg_shots"),
            func.avg(PlayerStat.score).label("avg_score"),
            func.sum(PlayerStat.goals).label("total_goals"),
            func.sum(PlayerStat.saves).label("total_saves"),
        )
        .filter(PlayerStat.is_me == True)
        .first()
    )

    win_rate = round((wins / total * 100), 1) if total > 0 else 0

    return {
        "total_replays": total,
        "wins":          wins,
        "losses":        losses,
        "win_rate":      win_rate,
        "avg_goals":     round(me.avg_goals or 0, 2),
        "avg_assists":   round(me.avg_assists or 0, 2),
        "avg_saves":     round(me.avg_saves or 0, 2),
        "avg_shots":     round(me.avg_shots or 0, 2),
        "avg_score":     round(me.avg_score or 0, 1),
        "total_goals":   me.total_goals or 0,
        "total_saves":   me.total_saves or 0,
    }


@router.get("/stats/me")
def get_my_stats(db: Session = Depends(get_db)):
    """Medias detalladas de mis stats: overall, en victorias y en derrotas."""
    from sqlalchemy import func

    def compute_avgs(result_filter=None):
        q = (
            db.query(
                func.avg(PlayerStat.goals).label("goals"),
                func.avg(PlayerStat.assists).label("assists"),
                func.avg(PlayerStat.saves).label("saves"),
                func.avg(PlayerStat.shots).label("shots"),
                func.avg(PlayerStat.score).label("score"),
                func.avg(PlayerStat.boost_collected).label("boost_collected"),
                func.avg(PlayerStat.avg_speed).label("avg_speed"),
                func.avg(PlayerStat.time_supersonic).label("time_supersonic"),
                func.count().label("n"),
            )
            .join(Replay, PlayerStat.replay_id == Replay.id)
            .filter(PlayerStat.is_me == True)
        )
        if result_filter:
            q = q.filter(Replay.result == result_filter)
        row = q.first()
        if not row or not row.n:
            return None

        def r(v, d=2):
            return round(float(v), d) if v is not None else None

        return {
            "count":           row.n,
            "goals":           r(row.goals),
            "assists":         r(row.assists),
            "saves":           r(row.saves),
            "shots":           r(row.shots),
            "score":           r(row.score, 1),
            "boost_collected": r(row.boost_collected, 1),
            "avg_speed":       r(row.avg_speed, 1),
            "time_supersonic": r(row.time_supersonic, 1),
        }

    return {
        "overall": compute_avgs(),
        "wins":    compute_avgs("win"),
        "losses":  compute_avgs("loss"),
    }



@router.get("/status")
def get_status():
    """Estado del servidor — usado por el frontend para saber si el backend está vivo."""
    from config import PLAYER_NAME, REPLAYS_FOLDER
    import os
    return {
        "status":         "ok",
        "player_name":    PLAYER_NAME,
        "replays_folder": REPLAYS_FOLDER,
        "folder_exists":  os.path.exists(REPLAYS_FOLDER),
    }
