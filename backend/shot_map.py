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

from field_constants import GOAL_Y, GOAL_HALF_WIDTH, GOAL_HEIGHT, uu_to_m

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


def _speed_kmh(ball, t0):
    """Velocidad del balón justo tras el toque, en km/h."""
    p0 = _ball_at(ball, t0 + 0.05)
    p1 = _ball_at(ball, t0 + 0.20)
    return round(math.dist(p0, p1) / 0.15 * UU_TO_KMH)


def _real_crossing(ball, t0, t_max, target_y):
    """Primer punto (x, z) donde el balón cruza el plano Y=target_y entre t0 y t_max,
    leído de los frames reales (exacto: respeta arcos, rebotes y entradas a portería)."""
    prev = None
    for b in ball:
        if b[0] < t0:
            prev = b
            continue
        if b[0] > t_max:
            break
        if prev is not None:
            y0, y1 = prev[2], b[2]
            if (y0 - target_y) * (y1 - target_y) <= 0 and y1 != y0:
                k = (target_y - y0) / (y1 - y0)
                return round(prev[1] + (b[1] - prev[1]) * k), round(prev[3] + (b[3] - prev[3]) * k)
        prev = b
    return None


def _extrapolated(ball, t0, target_y):
    """Estimación recta (sin gravedad) de dónde iba el tiro, para cuando no hay cruce real
    (p. ej. una parada lo detiene antes del plano). Sin gravedad: evita que un tiro largo
    se 'hunda' por debajo de la portería."""
    p0 = _ball_at(ball, t0 + 0.05)
    p1 = _ball_at(ball, t0 + 0.20)
    vx, vy, vz = ((p1[i] - p0[i]) / 0.15 for i in range(3))
    if (target_y > 0 and vy <= 5) or (target_y < 0 and vy >= -5):
        return None   # no va hacia la portería objetivo
    tt = (target_y - p1[1]) / vy
    if not (0 < tt < 4.0):
        return None
    return round(p1[0] + vx * tt), round(p1[2] + vz * tt)


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

        # Resultado: gol/parada en la ventana del tiro (+margen para rebote/entrada)
        goal_t = next((g.get("time") for g in goals
                       if g.get("team") == team and t0 <= g.get("time", -1) <= t1 + 0.8), None)
        save_t = next((sv.get("time") for sv in saves
                       if bool(sv.get("is_team_0")) != team0 and t0 <= sv.get("time", -1) <= t1 + 0.8), None)
        outcome = "gol" if goal_t is not None else "parada" if save_t is not None else "fuera"

        # Posición del impacto: cruce REAL del plano de portería (exacto para goles y para
        # fueras que cruzan); si no cruza (lo paran antes), se estima la trayectoria.
        t_max = (goal_t + 0.4) if goal_t is not None else \
                (save_t + 0.4) if save_t is not None else (t0 + 2.5)
        pt = _real_crossing(ball, t0, t_max, target_y) or _extrapolated(ball, t0, target_y)
        x, z = pt if pt else (None, None)

        bp = s.get("ball_position") or s.get("player_position")
        dist_m = uu_to_m(abs(target_y - bp[1])) if bp and len(bp) >= 2 else None

        out.append({
            "player_id": s.get("player"),
            "team":       team,
            "target_x":   x,
            "target_z":   z,
            "on_target":  _is_on_target(x, z),
            "outcome":    outcome,
            "speed_kmh":  _speed_kmh(ball, t0),
            "dist_m":     dist_m,
            "time":       round(t0, 1),
        })
    return out
