from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class Replay(Base):
    __tablename__ = "replays"

    id            = Column(Integer, primary_key=True, index=True)
    file_path     = Column(String, unique=True, index=True)
    file_name     = Column(String)
    map_name      = Column(String, nullable=True)
    match_type    = Column(String, nullable=True)   # Ranked, Casual, etc.
    team_size     = Column(Integer, nullable=True)  # 1, 2 o 3
    duration_secs = Column(Float, nullable=True)
    played_at     = Column(DateTime, nullable=True)
    result        = Column(String, nullable=True)   # "win", "loss", "unknown"
    my_team       = Column(Integer, nullable=True)  # 0 o 1
    team0_score   = Column(Integer, nullable=True)
    team1_score   = Column(Integer, nullable=True)
    is_solo_queue = Column(Boolean, default=True)
    is_favorite   = Column(Boolean, default=False)
    playlist_id   = Column(Integer, nullable=True)
    game_category = Column(String, nullable=True)  # "Ranked" | "Extra" | "Casual"
    raw_meta      = Column(Text, nullable=True)     # JSON crudo de subtr-actor (debug)
    processed_at  = Column(DateTime, default=datetime.utcnow)

    players = relationship("PlayerStat", back_populates="replay", cascade="all, delete-orphan")


class PlayerStat(Base):
    __tablename__ = "player_stats"

    id               = Column(Integer, primary_key=True, index=True)
    replay_id        = Column(Integer, ForeignKey("replays.id"), index=True)
    player_name      = Column(String)
    platform_id      = Column(String, nullable=True)
    team             = Column(Integer, nullable=True)  # 0 o 1
    is_me            = Column(Boolean, default=False)

    # Stats del header del replay (siempre disponibles)
    score            = Column(Integer, nullable=True)
    goals            = Column(Integer, nullable=True)
    assists          = Column(Integer, nullable=True)
    saves            = Column(Integer, nullable=True)
    shots            = Column(Integer, nullable=True)
    demos_inflicted  = Column(Integer, nullable=True)

    # Stats de boost (de subtr-actor stats module)
    boost_collected  = Column(Float, nullable=True)
    boost_stolen     = Column(Float, nullable=True)
    boost_wasted     = Column(Float, nullable=True)
    avg_boost        = Column(Float, nullable=True)

    # Stats de movimiento
    avg_speed        = Column(Float, nullable=True)
    time_supersonic  = Column(Float, nullable=True)  # segundos
    time_boost_speed = Column(Float, nullable=True)
    time_slow        = Column(Float, nullable=True)
    time_on_ground   = Column(Float, nullable=True)
    time_low_air     = Column(Float, nullable=True)
    time_high_air    = Column(Float, nullable=True)
    total_distance   = Column(Float, nullable=True)

    replay = relationship("Replay", back_populates="players")
