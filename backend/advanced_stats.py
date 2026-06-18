"""
advanced_stats.py — RLAnalyzer
Estadísticas avanzadas de posición/posesión calculadas a partir de las posiciones
por frame (salida de replay_frames._parse_rrrocket). Función PURA: no toca BD, red
ni rrrocket; se puede testear con un dict de frames de muestra.

Entrada: dict de frames {players:[{name,team}], ball:[[t,x,y,z]], cars:[[t,idx,x,y,z,...]], duration}
Salida:  {players: {idx: {...}}, teams: {0:{possession_pct}, 1:{...}}, meta: {...}}
"""
import math

from field_constants import own_goal_y, uu_to_m


def _dist3d(a, b):
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)


def _dist2d(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def compute_advanced(frames: dict) -> dict:
    players = frames.get("players") or []
    n = len(players)
    teams = [p.get("team") for p in players]

    ball = frames.get("ball") or []
    cars = frames.get("cars") or []

    # Índices por tiempo
    ball_at = {round(b[0], 3): (b[1], b[2], b[3]) for b in ball if len(b) >= 4}
    cars_at: dict = {}
    for row in cars:
        if len(row) < 5:
            continue
        t = round(row[0], 3)
        cars_at.setdefault(t, {})[row[1]] = (row[2], row[3], row[4])

    poss_count = [0] * n
    poss_total = 0
    goal_sum = [0.0] * n; goal_cnt = [0] * n
    mate_sum = [0.0] * n; mate_cnt = [0] * n
    off_cnt = [0] * n; pos_cnt = [0] * n

    for t, carpos in cars_at.items():
        # ── Posesión: coche más cercano al balón (3D) ──
        bp = ball_at.get(t)
        if bp is not None and carpos:
            best_idx, best_d = None, None
            for idx, cp in carpos.items():
                if not (0 <= idx < n):
                    continue
                d = _dist3d(cp, bp)
                if best_d is None or d < best_d:
                    best_d, best_idx = d, idx
            if best_idx is not None:
                poss_count[best_idx] += 1
                poss_total += 1

        # ── Posicionamiento por coche (2D, plano XY) ──
        for idx, cp in carpos.items():
            if not (0 <= idx < n) or teams[idx] is None:
                continue
            team = teams[idx]
            goal_sum[idx] += _dist2d(cp, (0.0, own_goal_y(team))); goal_cnt[idx] += 1
            # Se ataca alejándose de la portería propia → derivar el signo de own_goal_y
            # (una sola fuente de verdad del eje: corregirla ahí ajusta también esto).
            attack_sign = -1 if own_goal_y(team) > 0 else 1
            pos_cnt[idx] += 1
            if cp[1] * attack_sign > 0:
                off_cnt[idx] += 1

        # ── Distancia al compañero (2D) ──
        byteam: dict = {}
        for idx, cp in carpos.items():
            if 0 <= idx < n and teams[idx] is not None:
                byteam.setdefault(teams[idx], []).append((idx, cp))
        for members in byteam.values():
            if len(members) < 2:
                continue
            for idx, cp in members:
                ds = [_dist2d(cp, op) for oidx, op in members if oidx != idx]
                if ds:
                    mate_sum[idx] += sum(ds) / len(ds); mate_cnt[idx] += 1

    players_out: dict = {}
    for idx in range(n):
        players_out[idx] = {
            "name": players[idx].get("name"),
            "team": teams[idx],
            "possession_pct": round(poss_count[idx] / poss_total * 100, 1) if poss_total else None,
            "avg_dist_to_goal": uu_to_m(goal_sum[idx] / goal_cnt[idx]) if goal_cnt[idx] else None,
            "avg_dist_to_teammate": uu_to_m(mate_sum[idx] / mate_cnt[idx]) if mate_cnt[idx] else None,
            "time_offensive_half_pct": round(off_cnt[idx] / pos_cnt[idx] * 100, 1) if pos_cnt[idx] else None,
            "frames_counted": pos_cnt[idx],
        }

    teams_out: dict = {}
    for team in (0, 1):
        tc = sum(poss_count[i] for i in range(n) if teams[i] == team)
        teams_out[team] = {"possession_pct": round(tc / poss_total * 100, 1) if poss_total else None}

    return {
        "players": players_out,
        "teams": teams_out,
        "meta": {"possession_frames": poss_total, "duration": frames.get("duration")},
    }
