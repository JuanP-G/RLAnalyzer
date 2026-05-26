"""
replay_frames.py — RLAnalyzer
Extrae posiciones frame a frame (balón + coches) de un .replay
usando rrrocket.exe y construye una actor state machine.

Salida compacta:
{
  "duration": float,
  "players": [{"name": str, "team": 0|1}],
  "goals":   [{"time": float, "team": 0|1}],
  "ball":    [[t, x, y, z], ...],
  "cars":    [[t, car_idx, x, y, z, yaw], ...]
}
"""

import json
import logging
import math
import os
import subprocess
import sys

from config import BASE_DIR   # C:\...\RLAnalyzer  (ya probado y correcto)

logger = logging.getLogger(__name__)

RRROCKET_EXE     = os.path.join(BASE_DIR, "tools", "rrrocket.exe")
FRAMES_CACHE_DIR = os.path.join(BASE_DIR, "data", "frames")

os.makedirs(FRAMES_CACHE_DIR, exist_ok=True)

# ── Sampling: 1 de cada N frames (30fps → ~10fps efectivos) ──────────────────
SAMPLE_EVERY = 3


# ── Actor object names conocidos de RL ───────────────────────────────────────
def _is_ball(name: str) -> bool:
    n = name.lower()
    return ("ball" in n and "breakout" not in n and "pinball" not in n
            and "rugby" not in n and "basketball" not in n)


def _is_car(name: str) -> bool:
    n = name.lower()
    return "car_default" in n or ("car_ta" in n and "ball" not in n)


def _is_player_info(name: str) -> bool:
    return "playerreplicationinfo" in name.lower()


def _actor_id(obj) -> int:
    """Normaliza actor_id — puede ser int o {"value": int}."""
    if isinstance(obj, dict):
        return obj.get("value", 0)
    return int(obj)


def _uid_key(uid_attr) -> str:
    """Devuelve una clave estable a partir de UniqueId (sirve para dedup entre respawns)."""
    if not isinstance(uid_attr, dict):
        return ""
    sys_id = uid_attr.get("system_id", 0)
    remote = uid_attr.get("remote_id", {})
    if isinstance(remote, dict):
        for platform, info in remote.items():
            if isinstance(info, dict):
                oid = info.get("online_id") or info.get("id") or ""
                return f"{sys_id}:{platform}:{oid}"
            if isinstance(info, str):
                return f"{sys_id}:{platform}:{info}"
    return f"{sys_id}:{remote}"


def _pri_uid_key(attrs: dict) -> str:
    """Extrae la clave UniqueId desde el dict de atributos de un actor PRI."""
    uid = attrs.get("UniqueId")
    if uid:
        return _uid_key(uid)
    return ""


def _name_from_uid(uid_attr) -> str:
    """Intenta extraer el nombre del jugador del UniqueId (solo plataformas que lo incluyen)."""
    if not isinstance(uid_attr, dict):
        return ""
    remote = uid_attr.get("remote_id", {})
    if isinstance(remote, dict):
        for platform, info in remote.items():
            if isinstance(info, dict):
                name = info.get("name") or info.get("player_name") or ""
                if isinstance(name, str) and name:
                    return name
    return ""


# ── Extracción principal ──────────────────────────────────────────────────────

def extract_frames(replay_path: str) -> dict:
    """
    Corre rrrocket sobre replay_path y construye los frame data.
    Devuelve el dict compacto o lanza RuntimeError si falla.
    """
    if not os.path.exists(RRROCKET_EXE):
        raise RuntimeError(f"rrrocket.exe no encontrado en {RRROCKET_EXE}")
    if not os.path.exists(replay_path):
        raise RuntimeError(f"Replay no encontrado: {replay_path}")

    logger.info(f"Ejecutando rrrocket sobre {os.path.basename(replay_path)}")

    # ── Lanzar rrrocket ───────────────────────────────────────────────────────
    try:
        result = subprocess.run(
            [RRROCKET_EXE, "-n", replay_path],   # -n = parse network frames
            capture_output=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("rrrocket tardó demasiado (>120s)")
    except FileNotFoundError:
        raise RuntimeError("rrrocket.exe no se pudo ejecutar")

    if result.returncode != 0:
        err = result.stderr.decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"rrrocket error {result.returncode}: {err}")

    raw_bytes = result.stdout
    if not raw_bytes:
        raise RuntimeError("rrrocket no produjo salida")

    logger.info(f"rrrocket output: {len(raw_bytes)/1024/1024:.1f} MB")

    try:
        data = json.loads(raw_bytes)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"JSON inválido de rrrocket: {e}")

    return _parse_rrrocket(data)


def _quat_to_yaw(rot: dict) -> float:
    """Convierte quaternion {x,y,z,w} a yaw en radianes (rotación Z)."""
    x = rot.get("x", 0) or 0
    y = rot.get("y", 0) or 0
    z = rot.get("z", 0) or 0
    w = rot.get("w", 0) or 0
    return math.atan2(2.0 * (w * z + x * y), 1.0 - 2.0 * (y * y + z * z))


def _parse_rrrocket(data: dict) -> dict:
    """
    Construye actor state machine sobre el JSON de rrrocket y
    devuelve el dict compacto de frames.
    """
    net = data.get("network_frames") or {}
    frames_raw = net.get("frames") or []
    props      = data.get("properties") or {}

    # ── Tabla de objetos: object_id → nombre ─────────────────────────────────
    # En rrrocket 0.11+, new_actors usan object_id (índice en data["objects"])
    # en lugar de object_name inline.
    objects_list = data.get("objects") or []
    logger.info(f"objects_list length: {len(objects_list)}, n_frames: {len(frames_raw)}")

    # ── Metadata ──────────────────────────────────────────────────────────────
    duration = 0.0
    if frames_raw:
        last = frames_raw[-1]
        if isinstance(last, dict):
            duration = last.get("time", 0.0)

    # Goles desde properties
    goals_out = []
    goals_prop = props.get("Goals", {})
    if isinstance(goals_prop, dict):
        goals_list = goals_prop.get("Array", [])
    elif isinstance(goals_prop, list):
        goals_list = goals_prop
    else:
        goals_list = []

    for g in goals_list:
        if isinstance(g, dict):
            frame_no = g.get("frame") or g.get("Frame") or 0
            team     = g.get("PlayerTeam") or g.get("team") or 0
            # Convertir frame number a tiempo
            if isinstance(frame_no, int) and frame_no < len(frames_raw):
                fr = frames_raw[frame_no]
                t = fr.get("time", 0) if isinstance(fr, dict) else 0
            else:
                t = 0
            goals_out.append({"time": round(t, 2), "team": int(team)})

    # ── Actor state machine ───────────────────────────────────────────────────
    # En rrrocket 0.11+ los coches NO tienen PlayerReplicationInfo.
    # El link car → jugador viene via ActiveActor en el coche, que apunta al
    # PRI (TAGame.Default__PRI_TA) actor. Los PRI se reutilizan across respawns
    # siempre que tengan el mismo UniqueId (= identidad estable del jugador).
    actors        = {}   # actor_id → {"name": str, "attrs": {}}
    ball_id       = None
    car_ids       = {}   # car actor_id → player_index
    pri_ids       = set()  # todos los actor IDs que son PRI_TA
    pri_to_player = {}   # PRI actor_id → player_index
    uid_to_player = {}   # UniqueId key → player_index (dedup entre respawns de PRI)

    ball_frames = []
    car_frames  = []
    players_out = []

    frame_count = len(frames_raw)

    for fi, frame in enumerate(frames_raw):
        if not isinstance(frame, dict):
            continue
        t = frame.get("time", 0.0)

        # ── Nuevos actores ────────────────────────────────────────────────────
        for actor in (frame.get("new_actors") or []):
            if not isinstance(actor, dict):
                continue
            aid = _actor_id(actor.get("actor_id", 0))

            obj_id = actor.get("object_id")
            if obj_id is not None and 0 <= obj_id < len(objects_list):
                name = objects_list[obj_id] or ""
            else:
                name = actor.get("object_name", "") or ""

            actors[aid] = {"name": name, "attrs": {}}

            init_traj = actor.get("initial_trajectory") or {}
            if isinstance(init_traj, dict):
                loc = init_traj.get("location")
                rot = init_traj.get("rotation")
                if isinstance(loc, dict):
                    actors[aid]["attrs"]["_init_loc"] = loc
                if isinstance(rot, dict):
                    actors[aid]["attrs"]["_init_rot"] = rot

            if _is_ball(name):
                ball_id = aid
            elif _is_car(name) and aid not in car_ids:
                # Slot provisional — se reasignará cuando ActiveActor llegue
                idx = len(players_out)
                car_ids[aid] = idx
                players_out.append({"name": f"Car_{idx}", "team": idx % 2})
            elif _is_player_info(name):
                pri_ids.add(aid)

        # ── Actores actualizados ──────────────────────────────────────────────
        for update in (frame.get("updated_actors") or []):
            if not isinstance(update, dict):
                continue
            aid  = _actor_id(update.get("actor_id", 0))
            attr = update.get("attribute") or {}
            if not attr or not isinstance(attr, dict):
                continue
            if aid not in actors:
                actors[aid] = {"name": "", "attrs": {}}
            actors[aid]["attrs"].update(attr)

            # ── UniqueId en PRI → deduplicar respawns de PRI ─────────────────
            # UniqueId es estable (Epic/PSN/Steam ID). Si ya hemos visto ese
            # ID, el nuevo PRI actor es una reaparición del mismo jugador.
            if "UniqueId" in attr and (aid in pri_ids or _is_player_info(actors[aid]["name"])):
                pri_ids.add(aid)
                uid_key = _uid_key(attr["UniqueId"])
                if uid_key:
                    if uid_key in uid_to_player:
                        pri_to_player[aid] = uid_to_player[uid_key]
                    elif aid in pri_to_player:
                        # Este PRI ya tiene slot (vía ActiveActor) → registrar uid
                        uid_to_player[uid_key] = pri_to_player[aid]
                    # else: PRI sin slot aún; se registrará cuando coche haga link

            # ── Nombre del jugador extraído del UniqueId (plataformas con name)
            if "UniqueId" in attr and aid in pri_to_player:
                name_from_uid = _name_from_uid(attr["UniqueId"])
                if name_from_uid:
                    idx = pri_to_player[aid]
                    if 0 <= idx < len(players_out) and players_out[idx]["name"].startswith("Car_"):
                        players_out[idx]["name"] = name_from_uid

            # ── ActiveActor en coche → link con PRI ──────────────────────────
            # En rrrocket 0.11+, Car.ActiveActor.actor = PRI actor ID.
            # Usamos esto para deduplicar respawns de coches.
            if "ActiveActor" in attr and aid in car_ids:
                aa = attr["ActiveActor"]
                if isinstance(aa, dict) and aa.get("active"):
                    pri_aid = aa.get("actor")
                    if isinstance(pri_aid, int):
                        pri_ids.add(pri_aid)
                        if pri_aid in pri_to_player:
                            # PRI ya conocido → reutilizar slot
                            car_ids[aid] = pri_to_player[pri_aid]
                        else:
                            # PRI nuevo → registrar el slot de este coche
                            pri_to_player[pri_aid] = car_ids[aid]
                            # Y propagar a UniqueId si ya lo conocemos
                            uid_key = _pri_uid_key(actors.get(pri_aid, {}).get("attrs", {}))
                            if uid_key:
                                if uid_key in uid_to_player:
                                    car_ids[aid] = uid_to_player[uid_key]
                                    pri_to_player[pri_aid] = uid_to_player[uid_key]
                                else:
                                    uid_to_player[uid_key] = car_ids[aid]

            # ── Equipo del coche via TeamPaint ────────────────────────────────
            if "TeamPaint" in attr and aid in car_ids:
                tp = attr["TeamPaint"]
                if isinstance(tp, dict):
                    team_val = tp.get("team")
                    if team_val is not None:
                        idx = car_ids[aid]
                        if 0 <= idx < len(players_out):
                            players_out[idx]["team"] = int(team_val)

        # ── Actores eliminados ────────────────────────────────────────────────
        for deleted in (frame.get("deleted_actors") or []):
            if deleted is None:
                continue
            did = _actor_id(deleted)
            actors.pop(did, None)
            if did == ball_id:
                ball_id = None

        # ── Sampling: 1 de cada N frames ─────────────────────────────────────
        if fi % SAMPLE_EVERY != 0:
            continue

        # Balón
        if ball_id and ball_id in actors:
            a  = actors[ball_id]["attrs"]
            rb = a.get("RigidBody")
            if rb and isinstance(rb, dict):
                loc = rb.get("location")
            else:
                loc = a.get("_init_loc")
            if loc and isinstance(loc, dict):
                ball_frames.append([
                    round(t, 3),
                    round(loc.get("x", 0), 1),
                    round(loc.get("y", 0), 1),
                    round(loc.get("z", 0), 1),
                ])

        # Coches
        for car_aid, player_idx in car_ids.items():
            if car_aid not in actors:
                continue
            a  = actors[car_aid]["attrs"]
            rb = a.get("RigidBody")
            if rb and isinstance(rb, dict):
                loc = rb.get("location")
                rot = rb.get("rotation")
            else:
                loc = a.get("_init_loc")
                rot = a.get("_init_rot")
            if not loc or not isinstance(loc, dict):
                continue
            yaw = 0.0
            if rot and isinstance(rot, dict):
                if "w" in rot:
                    yaw = _quat_to_yaw(rot)
                else:
                    raw = rot.get("yaw", 0) or 0
                    yaw = (raw / 32767.0) * math.pi
            car_frames.append([
                round(t, 3),
                player_idx,
                round(loc.get("x", 0), 1),
                round(loc.get("y", 0), 1),
                round(loc.get("z", 0), 1),
                round(yaw, 4),
            ])

    # ── Limpiar slots de jugadores duplicados (de respawns) ───────────────────
    used_indices = sorted(set(car_ids.values()))
    if used_indices and len(used_indices) < len(players_out):
        idx_remap   = {old: new for new, old in enumerate(used_indices)}
        players_out = [players_out[i] for i in used_indices]
        car_frames  = [
            [t, idx_remap[idx], x, y, z, yaw]
            for t, idx, x, y, z, yaw in car_frames
            if idx in idx_remap
        ]

    logger.info(
        f"Frames: {frame_count} raw → {len(ball_frames)} ball, "
        f"{len(car_frames)} car entries, {len(players_out)} jugadores"
    )

    return {
        "duration":  round(duration, 2),
        "players":   players_out,
        "goals":     goals_out,
        "ball":      ball_frames,
        "cars":      car_frames,
    }


# ── Cache en disco ────────────────────────────────────────────────────────────

def get_frames_cached(replay_id: int, replay_path: str) -> dict:
    """
    Devuelve frames desde caché si existen, si no los genera y cachea.
    """
    cache_path = os.path.join(FRAMES_CACHE_DIR, f"{replay_id}.json")

    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            cached = json.load(f)
        # Validar que la caché no es de una extracción rota (sin -n flag)
        if cached.get("duration", 0) > 0 and cached.get("ball"):
            logger.info(f"Frames desde caché: {cache_path}")
            return cached
        logger.warning(f"Caché inválida (duration=0 o sin ball frames), re-extrayendo…")
        os.remove(cache_path)

    frames = extract_frames(replay_path)

    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(frames, f, separators=(",", ":"))  # compacto sin espacios
    logger.info(f"Frames cacheados en {cache_path}")

    return frames
