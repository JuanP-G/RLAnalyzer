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


# ──────────────────────────────────────────────────────────────────────────────
#  Builders para mockear subtr_actor (parser.py). Los IDs se comparten entre meta
#  (remote_id) y stats (player_id) para que el cruce boost/movement por id cuadre.
# ──────────────────────────────────────────────────────────────────────────────
EPIC_ME   = "epic-me-uuid"
EPIC_MATE = "epic-mate-uuid"
STEAM_OPP = "76561190000000001"
EPIC_OPP2 = "epic-opp2-uuid"


def build_subtr_props(*, map_name="DFH Stadium", match_type="Online", num_frames=9000,
                      record_fps=30.0, date="2026-05-01 20-30-15", team_size=2,
                      playlist_id=11, goals_teams=(0, 1, 0)):
    """Respuesta de subtr_actor.parse_replay(bytes)."""
    return {"properties": {
        "MapName": map_name, "MatchType": match_type, "NumFrames": num_frames,
        "RecordFPS": record_fps, "Date": date, "TeamSize": team_size,
        "PlaylistId": playlist_id,
        "Goals": [{"PlayerTeam": t} for t in goals_teams],
    }}


def _meta_player(name, *, score, goals, assists, saves, shots, remote_id):
    return {
        "name": name,
        "stats": {"Name": name, "Score": score, "Goals": goals, "Assists": assists,
                  "Saves": saves, "Shots": shots, "OnlineID": list(remote_id.values())[0]},
        "remote_id": remote_id,
    }


def build_subtr_meta(*, me=ME, include_headers=True):
    """Respuesta de subtr_actor.get_replay_meta(path). 'me' en team_zero."""
    rm = {
        "team_zero": [
            _meta_player(me,     score=400, goals=2, assists=1, saves=2, shots=4, remote_id={"Epic": EPIC_ME}),
            _meta_player("Mate", score=250, goals=1, assists=0, saves=1, shots=3, remote_id={"Epic": EPIC_MATE}),
        ],
        "team_one": [
            _meta_player("Rival1", score=300, goals=1, assists=1, saves=3, shots=5, remote_id={"Steam": STEAM_OPP}),
            _meta_player("Rival2", score=180, goals=0, assists=0, saves=2, shots=2, remote_id={"Epic": EPIC_OPP2}),
        ],
    }
    if include_headers:
        rm["all_headers"] = [["TeamSize", 2], ["MapName", "DFH Stadium"]]
    return {"replay_meta": rm}


def build_subtr_stats(*, tracked_time=120.0, speed_integral=180000.0,
                      amount_collected=2500.0, amount_stolen=100.0, amount_used=2100.0,
                      boost_integral=45.0, pids=(EPIC_ME, EPIC_MATE, STEAM_OPP, EPIC_OPP2),
                      include_demo=True):
    """Respuesta de subtr_actor.get_stats/get_summed_stats(path, module_names=[...])."""
    def boost(pid):
        return {"player_id": {"id": pid},
                "stats": {"amount_collected": amount_collected, "amount_stolen": amount_stolen,
                          "amount_used": amount_used, "boost_integral": boost_integral}}
    def move(pid):
        return {"player_id": {"id": pid},
                "stats": {"speed_integral": speed_integral, "tracked_time": tracked_time,
                          "time_supersonic_speed": 30.0, "time_boost_speed": 80.0,
                          "time_slow_speed": 40.0, "time_on_ground": 200.0,
                          "time_low_air": 50.0, "time_high_air": 10.0, "total_distance": 100000.0}}
    # demos por jugador (índice → inflicted/taken)
    _demos = [(2, 1), (0, 0), (1, 1), (0, 2)]
    def demo(i, pid):
        inf, tak = _demos[i % len(_demos)]
        return {"player_id": {"id": pid}, "stats": {"demos_inflicted": inf, "demos_taken": tak}}
    modules = {
        "boost":    {"player_stats": [boost(p) for p in pids]},
        "movement": {"player_stats": [move(p) for p in pids]},
    }
    if include_demo:
        modules["demo"] = {"player_stats": [demo(i, p) for i, p in enumerate(pids)]}
    return {"modules": modules}


# ──────────────────────────────────────────────────────────────────────────────
#  Builder de JSON de rrrocket (replay_frames._parse_rrrocket / extract_frames)
#  objects: 0=balón, 1=coche, 2=PRI. Coches enlazan a PRI por ActiveActor.
# ──────────────────────────────────────────────────────────────────────────────
def build_rrrocket_data(*, n_frames=7, goal_frame=3, respawn=False):
    objects = ["Archetypes.Ball.Ball_Default", "Archetypes.Car.Car_Default", "TAGame.Default__PRI_TA"]

    def rb(x, y, z):
        return {"RigidBody": {"location": {"x": x, "y": y, "z": z},
                              "rotation": {"x": 0, "y": 0, "z": 0, "w": 1}}}

    frame0 = {
        "time": 0.0,
        "new_actors": [
            {"actor_id": 1, "object_id": 0, "initial_trajectory": {"location": {"x": 0, "y": 0, "z": 100}}},
            {"actor_id": 2, "object_id": 1, "initial_trajectory": {"location": {"x": -500, "y": 0, "z": 17}}},
            {"actor_id": 3, "object_id": 1, "initial_trajectory": {"location": {"x": 500, "y": 0, "z": 17}}},
            {"actor_id": 10, "object_id": 2},
            {"actor_id": 11, "object_id": 2},
        ],
        "updated_actors": [
            {"actor_id": 2, "attribute": {"ActiveActor": {"active": True, "actor": 10},
                                          "TeamPaint": {"team": 0}, **rb(-500, 0, 17)}},
            {"actor_id": 3, "attribute": {"ActiveActor": {"active": True, "actor": 11},
                                          "TeamPaint": {"team": 1}, **rb(500, 0, 17)}},
            {"actor_id": 10, "attribute": {"UniqueId": {"system_id": 1,
                "remote_id": {"Steam": {"online_id": "steam-1", "name": "Mate"}}}}},
            {"actor_id": 11, "attribute": {"UniqueId": {"system_id": 1,
                "remote_id": {"Epic": {"online_id": "epic-xyz"}}}}},  # Epic sin name → Car_1
            {"actor_id": 1, "attribute": rb(0, 0, 100)},
        ],
        "deleted_actors": [],
    }

    frames = [frame0]
    for i in range(1, n_frames):
        fr = {"time": round(i * 0.1, 3), "new_actors": [], "updated_actors": [], "deleted_actors": []}
        if respawn and i == 4:
            fr["deleted_actors"] = [2]
            fr["new_actors"] = [{"actor_id": 4, "object_id": 1,
                                 "initial_trajectory": {"location": {"x": -400, "y": 0, "z": 17}}}]
            fr["updated_actors"] = [{"actor_id": 4, "attribute": {
                "ActiveActor": {"active": True, "actor": 10}, "TeamPaint": {"team": 0}, **rb(-400, 0, 17)}}]
        frames.append(fr)

    props = {"Goals": {"Array": [{"frame": goal_frame, "PlayerTeam": 0}]}} if goal_frame is not None else {}
    return {"network_frames": {"frames": frames}, "objects": objects, "properties": props}
