# API Reference — RLAnalyzer Backend

> Base URL: `http://localhost:8000`
> Documentación interactiva (Swagger): `http://localhost:8000/docs`

---

## Replays

### `GET /api/replays`

Lista de replays ordenadas por fecha descendente, con filtros opcionales.

**Query params:**

| Param | Tipo | Descripción |
|-------|------|-------------|
| `skip` | int | Offset de paginación (default: 0) |
| `limit` | int | Máximo de resultados (default: 50) |
| `result` | string | Filtrar por resultado: `win` \| `loss` |
| `favorite` | int | `1` para mostrar solo favoritas |
| `team_size` | int | Filtrar por modo: `1`, `2` o `3` |
| `match_type` | string | Filtrar por tipo: `Ranked`, `Casual`, etc. |
| `game_category` | string | Filtrar por categoría: `Ranked`, `Extra`, `Casual` |

**Respuesta:**
```json
{
  "total": 142,
  "replays": [
    {
      "id": 116,
      "file_name": "2C4DB832...",
      "file_path": "C:\\...\\2C4DB832....replay",
      "map_name": "DFH Stadium",
      "match_type": "Ranked",
      "game_category": "Ranked",
      "team_size": 2,
      "playlist_id": 11,
      "duration_secs": 312.4,
      "played_at": "2026-05-25T21:14:00",
      "result": "win",
      "my_team": 0,
      "team0_score": 3,
      "team1_score": 1,
      "is_solo_queue": true,
      "is_favorite": false,
      "processed_at": "2026-05-26T10:30:00"
    }
  ]
}
```

---

### `GET /api/replays/{replay_id}`

Detalle completo de un replay, incluyendo stats de todos los jugadores.

**Respuesta:**
```json
{
  "id": 116,
  "file_name": "...",
  "map_name": "DFH Stadium",
  "match_type": "Ranked",
  "team_size": 2,
  "result": "win",
  "team0_score": 3,
  "team1_score": 1,
  "players": [
    {
      "id": 201,
      "player_name": "GustoffotsuG",
      "team": 0,
      "is_me": true,
      "score": 650,
      "goals": 2,
      "assists": 1,
      "saves": 3,
      "shots": 5,
      "demos_inflicted": 0,
      "boost_collected": 4821.5,
      "boost_stolen": 120.0,
      "boost_wasted": 340.2,
      "avg_boost": 45.3,
      "avg_speed": 1320.8,
      "time_supersonic": 42.1,
      "time_boost_speed": 88.5,
      "time_slow": 34.2,
      "time_on_ground": 198.3,
      "time_low_air": 67.4,
      "time_high_air": 12.1,
      "total_distance": 412000.0
    }
  ]
}
```

---

### `PATCH /api/replays/{replay_id}/favorite`

Marca o desmarca un replay como favorito.

**Body:**
```json
{ "value": true }
```

**Respuesta:**
```json
{ "id": 116, "is_favorite": true }
```

---

### `GET /api/replays/{replay_id}/frames`

Devuelve posiciones frame a frame para el visor 3D. La primera llamada puede tardar 15-30s (procesado con rrrocket). Las siguientes van desde caché en disco.

**Respuesta:**
```json
{
  "duration": 312.4,
  "players": [
    { "name": "GustoffotsuG", "team": 0 },
    { "name": "ldz150",       "team": 0 },
    { "name": "Car_2",        "team": 1 },
    { "name": "Car_3",        "team": 1 }
  ],
  "goals": [
    { "time": 45.23, "team": 0 },
    { "time": 120.87, "team": 1 }
  ],
  "ball": [
    [0.033, 0.0, 0.0, 91.0],
    [0.066, 12.3, -5.1, 91.0]
  ],
  "cars": [
    [0.033, 0, 256.3, -1024.5, 17.2, 1.5708],
    [0.033, 1, -400.1, 900.2, 17.2, -0.7854]
  ]
}
```

**Formato de `ball`:** `[t, x, y, z]` — tiempo en segundos, posición en unidades Three.js (UU × 0.01)

**Formato de `cars`:** `[t, player_idx, x, y, z, yaw_rad]`

**Errores:**
- `404` — replay no encontrado, o el archivo `.replay` no existe en este PC
- `500` — error de rrrocket o parsing (incluye traceback)

---

### `GET /api/replays/{replay_id}/frames/debug`

Herramienta de diagnóstico. Inspecciona la estructura JSON raw de rrrocket sin procesado. Útil para diagnosticar por qué no se extraen datos correctamente.

**Respuesta:** objeto con keys del JSON, sample de actores, nombres de objetos, primeros RigidBody encontrados, etc.

---

### `GET /api/replays/debug/viewer-check`

Comprueba si rrrocket está instalado y si el primer replay de la BD tiene su archivo `.replay` accesible.

---

## Stats

### `GET /api/stats/summary`

Stats globales del jugador principal (`PLAYER_NAME`) para el Dashboard.

**Respuesta:**
```json
{
  "total_replays": 142,
  "wins": 78,
  "losses": 64,
  "win_rate": 54.9,
  "avg_goals": 1.42,
  "avg_assists": 0.89,
  "avg_saves": 1.23,
  "avg_shots": 3.1,
  "avg_score": 412.5,
  "total_goals": 201,
  "total_saves": 175
}
```

---

### `GET /api/stats/me`

Medias detalladas del jugador principal: overall, solo victorias, solo derrotas.

**Respuesta:**
```json
{
  "overall": {
    "count": 142,
    "goals": 1.42,
    "assists": 0.89,
    "saves": 1.23,
    "shots": 3.1,
    "score": 412.5,
    "boost_collected": 4210.3,
    "avg_speed": 1310.2,
    "time_supersonic": 38.4
  },
  "wins":   { "count": 78, ... },
  "losses": { "count": 64, ... }
}
```

---

## Perfil

### `GET /api/profile`

Datos de perfil del jugador desde tracker.gg. Devuelve datos en caché si frescos (< 10 min). Si no hay conexión, sirve el último dato guardado en disco.

Cuando los datos son del caché en disco se añaden `"_stale": true, "_offline": true`.

**Respuesta:**
```json
{
  "username": "GustoffotsuG",
  "avatarUrl": "https://...",
  "platform": "epic",
  "currentSeason": 16,
  "lastUpdated": "2026-05-26T10:00:00Z",
  "_stale": false,
  "overview": {
    "wins": { "value": 1240, "displayValue": "1,240", "label": "Wins" },
    "goals": { "value": 3812, "displayValue": "3,812", "label": "Goals" }
  },
  "playlists": [
    {
      "playlistId": 11,
      "name": "Ranked Doubles",
      "currentSeason": true,
      "tierValue": 14,
      "tierName": "Diamond III",
      "tierIconUrl": "https://...",
      "divisionName": "Division III",
      "mmr": 1024,
      "peak": 1087,
      "matchesPlayed": 312,
      "winStreak": 2,
      "wins": 168,
      "winPct": "53.8%",
      "divisionDown": 972,
      "divisionUp": 1050,
      "globalRank": 18420,
      "percentile": 83.2
    }
  ]
}
```

**Errores:**
- `503` — tracker.gg no disponible y sin caché en disco

---

### `GET /api/profile/history`

Historial de MMR por playlist (para gráficos de evolución). Devuelve el JSON raw de tracker.gg o `{}` si no disponible.

---

### `POST /api/profile/invalidate`

Borra la caché en memoria y en disco para forzar refresco completo en la próxima llamada a `/api/profile`.

**Respuesta:** `{ "ok": true }`

---

### `GET /api/profile/debug-stats`

Devuelve las claves raw de stats disponibles en cada segmento de playlist. Útil para diagnosticar qué campos expone la API de tracker.gg.

---

## General

### `GET /api/status`

Estado del servidor. Usado por el frontend para saber si el backend está vivo.

**Respuesta:**
```json
{
  "status": "ok",
  "player_name": "GustoffotsuG",
  "replays_folder": "C:\\...\\DemosEpic",
  "folder_exists": true
}
```

---

### `GET /`

Health check raíz.

**Respuesta:** `{ "message": "RLAnalyzer API funcionando", "docs": "/docs" }`

---

## Códigos de error comunes

| Código | Significado |
|--------|-------------|
| `404` | Replay, archivo o recurso no encontrado |
| `500` | Error interno (rrrocket, parsing, BD) — respuesta incluye traceback |
| `503` | tracker.gg no disponible y sin caché en disco |
