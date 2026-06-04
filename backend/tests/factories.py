"""Helpers para construir Replays y PlayerStats de prueba."""
from datetime import datetime
from models import Replay, PlayerStat

ME = "GustoffotsuG"  # coincide con config.PLAYER_NAME


def make_player(name, team, is_me=False, **kw):
    base = dict(
        score=300, goals=1, assists=0, saves=1, shots=2, demos_inflicted=0,
        boost_collected=1500.0, boost_stolen=100.0, boost_wasted=300.0, avg_boost=45.0,
        avg_speed=60.0, time_supersonic=30.0, time_boost_speed=80.0, time_slow=40.0,
        time_on_ground=200.0, time_low_air=50.0, time_high_air=10.0, total_distance=100000.0,
    )
    base.update(kw)
    return PlayerStat(player_name=name, team=team, is_me=is_me, **base)


def default_match(team_size, my_team):
    """Una partida con yo + compañeros + rivales (yo marca más goles)."""
    other = 1 - my_team
    players = [make_player(ME, team=my_team, is_me=True, goals=2, shots=4, saves=2)]
    players += [make_player(f"Mate{i}", team=my_team, goals=1, shots=3, saves=1)
                for i in range(team_size - 1)]
    players += [make_player(f"Opp{i}", team=other, goals=0, shots=2, saves=3)
                for i in range(team_size)]
    return players


_COUNTER = {"n": 0}


def make_replay(db, *, result="win", team_size=2, game_category="Ranked",
                played_at=None, team0_score=3, team1_score=1, my_team=0,
                duration_secs=300.0, is_favorite=False, match_type=None,
                playlist_id=11, file_path=None, players=None, commit=True):
    _COUNTER["n"] += 1
    r = Replay(
        file_path=file_path or f"C:/fake/replay_{_COUNTER['n']}.replay",
        file_name=f"replay_{_COUNTER['n']}.replay",
        map_name="DFH Stadium",
        match_type=match_type or game_category,
        team_size=team_size,
        game_category=game_category,
        playlist_id=playlist_id,
        duration_secs=duration_secs,
        played_at=played_at or datetime(2026, 5, 1, 20, 0),
        result=result,
        my_team=my_team,
        team0_score=team0_score,
        team1_score=team1_score,
        is_favorite=is_favorite,
    )
    r.players = players if players is not None else default_match(team_size, my_team)
    db.add(r)
    db.flush()
    if commit:
        db.commit()
    return r
