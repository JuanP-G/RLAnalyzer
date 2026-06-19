"""
shot_map.py — RLAnalyzer
Mapa de tiros de una partida: para cada tiro (toque con intention=="shot" de subtr-actor),
calcula a qué punto de la portería iba, su resultado (gol/parada/fuera) y su velocidad.

Función PURA: consume los eventos de toque de subtr-actor (módulo "touch") + los frames de
rrrocket (posiciones del balón por tiempo + goles). No toca BD ni red → testeable.

El punto en portería se obtiene EXTRAPOLANDO la trayectoria del balón justo tras el toque
hasta el plano de la portería objetivo (con gravedad para la altura). Así se ve "dónde iba"
el tiro aunque lo parasen (si esperáramos al cruce real, un tiro parado no tendría punto).
"""
import math

from field_constants import GOAL_Y, GOAL_HALF_WIDTH, GOAL_HEIGHT, GRAVITY, uu_to_m

UU_TO_KMH = 0.036   # UU/s → km/h (1 UU = 1 cm; ×0.01 = m/s; ×3.6 = km/h)


def _ball_at(ball, t):
    """Posición [x,y,z] del balón interpolada en el tiempo t. ball = [[t,x,y,z], ...]."""
    prev = None
    for b in ball:
        if b[0] >= t:
            if prev is None:
                return [b[1], b[2], b[3]]
            span = b[0] - prev[0]
            k = (t - prev[0]) / span if span else 0.0
            return [prev[i + 1] + (b[i + 1] - prev[i + 1]) * k for i in range(3)]
        prev = b
    return [prev[1], prev[2], prev[3]] if prev else [0.0, 0.0, 0.0]


def _target_on_goal(ball, t0, target_y):
    """Extrapola la velocidad del balón tras el toque hasta el plano Y=target_y.
    Devuelve (x, z) del impacto (z con gravedad) y la velocidad en km/h, o (None, speed)."""
    p0 = _ball_at(ball, t0 + 0.05)
    p1 = _ball_at(ball, t0 + 0.20)
    dt = 0.15
    vx, vy, vz = ((p1[i] - p0[i]) / dt for i in range(3))
    speed_kmh = round(math.dist(p0, p1) / dt * UU_TO_KMH)
    # ¿va hacia la portería objetivo? (signo de vy coherente y con algo de velocidad)
    if (target_y > 0 and vy <= 5) or (target_y < 0 and vy >= -5):
        return None, None, speed_kmh
    tt = (target_y - p1[1]) / vy
    if not (0 < tt < 3.0):
        return None, None, speed_kmh
    x = p1[0] + vx * tt
    z = p1[2] + vz * tt - 0.5 * GRAVITY * tt * tt
    return round(x), round(z), speed_kmh


def _is_on_target(x, z):
    return x is not None and abs(x) <= GOAL_HALF_WIDTH and -40 <= z <= GOAL_HEIGHT


def compute_shots(frames: dict, touch_events: list) -> list:
    """Lista de tiros de la partida. Cada tiro:
    {player_id, team, target_x, target_z, on_target, outcome: gol|parada|fuera,
     speed_kmh, dist_m, time}. player_id se resuelve a nombre fuera (en el endpoint)."""
    ball   = frames.get("ball") or []
    goals  = frames.get("goals") or []
    touches = touch_events or []
    shots = [e for e in touches if e.get("intention") == "shot"]
    saves = [e for e in touches if e.get("intention") == "save"]

    out = []
    for s in shots:
        team0 = bool(s.get("is_team_0"))
        team  = 0 if team0 else 1
        target_y = GOAL_Y if team0 else -GOAL_Y   # team0 ataca +Y, team1 -Y
        t0 = s.get("time") or 0.0
        bm = s.get("ball_movement") or {}
        t1 = bm.get("end_time") or (t0 + 3.0)

        x, z, speed = _target_on_goal(ball, t0, target_y)

        # Resultado dentro de la ventana del tiro (+margen para el rebote/entrada)
        goal  = any(g.get("team") == team and t0 <= g.get("time", -1) <= t1 + 0.6 for g in goals)
        saved = any(bool(sv.get("is_team_0")) != team0 and t0 <= sv.get("time", -1) <= t1 + 0.6
                    for sv in saves)
        outcome = "gol" if goal else "parada" if saved else "fuera"

        # Distancia del tirador a la portería objetivo (m), para contexto
        bp = s.get("ball_position") or s.get("player_position")
        dist_m = uu_to_m(abs(target_y - bp[1])) if bp and len(bp) >= 2 else None

        out.append({
            "player_id": s.get("player"),
            "team":       team,
            "target_x":   x,
            "target_z":   z,
            "on_target":  _is_on_target(x, z),
            "outcome":    outcome,
            "speed_kmh":  speed,
            "dist_m":     dist_m,
            "time":       round(t0, 1),
        })
    return out
