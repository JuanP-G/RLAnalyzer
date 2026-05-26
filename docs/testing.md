# Plan de Pruebas y Resultados — RLAnalyzer

> Última ejecución: 2026-05-26

---

## 1. Pruebas manuales ejecutadas (2026-05-26)

### 1.1 Backend — arranque y estado

| # | Prueba | Resultado |
|---|--------|-----------|
| B-01 | `python main.py` arranca sin errores | PASS |
| B-02 | `GET /` devuelve `{"message": "RLAnalyzer API funcionando"}` | PASS |
| B-03 | `GET /api/status` devuelve `folder_exists: true` | PASS |
| B-04 | `GET /docs` abre Swagger UI | PASS |
| B-05 | Tablas creadas en `rl_data.db` al primer arranque | PASS |

### 1.2 Backend — replays

| # | Prueba | Resultado |
|---|--------|-----------|
| R-01 | `GET /api/replays` devuelve lista con `total` correcto | PASS |
| R-02 | Filtro `result=win` devuelve solo victorias | PASS |
| R-03 | Filtro `result=loss` devuelve solo derrotas | PASS |
| R-04 | Filtro `team_size=2` devuelve solo 2v2 | PASS |
| R-05 | Filtro `favorite=1` devuelve solo favoritas | PASS |
| R-06 | Filtro `match_type=Ranked` filtra correctamente | PASS |
| R-07 | Paginación con `skip` y `limit` funciona | PASS |
| R-08 | `GET /api/replays/116` devuelve replay con `players` | PASS |
| R-09 | `PATCH /api/replays/116/favorite` con `{"value": true}` funciona | PASS |
| R-10 | `GET /api/replays/9999` devuelve 404 | PASS |

### 1.3 Backend — visor 3D (replay_frames.py)

| # | Prueba | Resultado | Notas |
|---|--------|-----------|-------|
| F-01 | `GET /api/replays/116/frames` devuelve sin error | PASS | ~20s primera vez |
| F-02 | `duration` > 0 | PASS | 312.4s |
| F-03 | `ball` contiene frames (> 0) | PASS | 2,847 frames |
| F-04 | `cars` contiene frames (> 0) | PASS | 11,388 entradas |
| F-05 | `players` contiene exactamente 4 jugadores (2v2) | PASS | Bug corregido (era 21) |
| F-06 | Jugadores de PSN/Steam tienen nombre visible | PASS | `ldz150`, `Len62504` |
| F-07 | Jugadores Epic muestran `Car_N` | PASS (limitación conocida) | Solo hash disponible |
| F-08 | Segunda llamada usa caché (< 1s) | PASS | Desde `data/frames/116.json` |
| F-09 | Caché inválida (`duration=0`) provoca re-extracción | PASS | Comprobado borrando caché |
| F-10 | `GET /api/replays/116/frames/debug` devuelve estructura JSON de rrrocket | PASS |

### 1.4 Backend — stats

| # | Prueba | Resultado |
|---|--------|-----------|
| S-01 | `GET /api/stats/summary` devuelve totales y win rate | PASS |
| S-02 | `GET /api/stats/me` devuelve overall, wins, losses | PASS |
| S-03 | Medias de goals/assists/saves son valores razonables | PASS |

### 1.5 Backend — perfil

| # | Prueba | Resultado |
|---|--------|-----------|
| P-01 | `GET /api/profile` devuelve datos de tracker.gg | PASS |
| P-02 | `playlists` contiene Ranked Doubles con mmr y tier | PASS |
| P-03 | `POST /api/profile/invalidate` limpia caché | PASS |
| P-04 | Segunda llamada a `/api/profile` usa caché en memoria (< 10min) | PASS |
| P-05 | Con disco sin conexión, devuelve `_offline: true` | PASS |

### 1.6 Frontend — Dashboard

| # | Prueba | Resultado |
|---|--------|-----------|
| D-01 | Dashboard carga con KPIs visibles | PASS |
| D-02 | Win rate % es correcto vs datos BD | PASS |
| D-03 | Últimas partidas muestran resultado (V/D) en color | PASS |
| D-04 | Sin backend activo muestra mensaje de error | PASS |

### 1.7 Frontend — Lista de replays

| # | Prueba | Resultado |
|---|--------|-----------|
| L-01 | Lista carga con replays ordenadas por fecha desc | PASS |
| L-02 | Filtro "Victoria" filtra a solo victorias | PASS |
| L-03 | Filtro "2v2" filtra por team_size | PASS |
| L-04 | Botón de favorito toggle funciona y persiste | PASS |
| L-05 | Paginación "Cargar más" funciona | PASS |
| L-06 | Click en replay navega a `/replays/:id` | PASS |

### 1.8 Frontend — Detalle de replay

| # | Prueba | Resultado |
|---|--------|-----------|
| T-01 | Muestra marcador, mapa y fecha | PASS |
| T-02 | Muestra dos equipos con sus jugadores | PASS |
| T-03 | Stats de cada jugador visibles (goles, asistencias, etc.) | PASS |
| T-04 | SpeedInfoPanel muestra velocidades y tiempo aéreo | PASS |
| T-05 | Comparativa vs media histórica visible | PASS |
| T-06 | Botón "Ver en 3D" navega a `/replays/:id/viewer` | PASS |

### 1.9 Frontend — Visor 3D

| # | Prueba | Resultado |
|---|--------|-----------|
| V-01 | Spinner visible durante carga de frames | PASS |
| V-02 | Campo bicolor renderiza correctamente (azul/naranja) | PASS |
| V-03 | 4 coches visibles en t=90s (2 azules, 2 naranjas) | PASS |
| V-04 | Balón visible y en posición coherente | PASS |
| V-05 | Etiquetas HTML de jugadores sobre cada coche | PASS |
| V-06 | OrbitControls: rotar, zoom y desplazar con ratón | PASS |
| V-07 | Timeline con seek funciona (cambio de posición) | PASS |
| V-08 | Marcadores de gol en timeline (líneas de color) | PASS |
| V-09 | Click en marcador de gol salta al momento | PASS |
| V-10 | Botones de velocidad 0.5×, 1×, 2×, 4× funcionan | PASS |
| V-11 | Play/Pause funciona | PASS |
| V-12 | Al llegar al final, la reproducción se detiene | PASS |

### 1.10 Frontend — Perfil

| # | Prueba | Resultado |
|---|--------|-----------|
| PR-01 | Carga avatar y nombre de usuario | PASS |
| PR-02 | Rangos por modo visibles con icono de tier | PASS |
| PR-03 | MMR y peak MMR visibles | PASS |
| PR-04 | Gráfico de historial MMR visible | PASS |
| PR-05 | Stats de carrera (wins, goals, etc.) visibles | PASS |

### 1.11 Electron — App de escritorio

| # | Prueba | Resultado |
|---|--------|-----------|
| E-01 | La app abre con ventana frameless y titlebar custom | PASS |
| E-02 | Botones min/max/close funcionan | PASS |
| E-03 | Maximize/restore cambia ícono correctamente | PASS |
| E-04 | Al cerrar la ventana, backend y frontend se detienen | PASS |

---

## 2. Bugs encontrados y corregidos (2026-05-26)

### BUG-01 — 21 jugadores en partida 2v2 (crítico)

**Síntoma:** `players` en `/api/replays/116/frames` devolvía 21 elementos en una partida 2v2.

**Causa raíz:** El código original buscaba atributo `PlayerReplicationInfo` en los actores de tipo `Car_Default` para hacer el link car→jugador. En rrrocket 0.11+, ese atributo no existe en los coches. El link correcto es `Car.ActiveActor.actor = PRI_actor_id`. Sin el link, cada uno de los ~113 respawns de `Car_Default` en una partida creaba un slot nuevo.

**Solución:** Reescritura completa del actor state machine en `replay_frames.py`:
- Link car→PRI vía `ActiveActor.actor`
- Deduplicación de PRI entre respawns vía `UniqueId` (clave estable por plataforma)
- Extracción de nombre del jugador desde `UniqueId.remote_id.{Platform}.name`

**Archivos afectados:** `backend/replay_frames.py`

### BUG-02 — Filtros de lista ignorados por el backend

**Síntoma:** Los filtros `match_type` y `game_category` enviados por el frontend (en `api.js`) eran ignorados silenciosamente.

**Causa raíz:** El endpoint `GET /api/replays` no tenía `match_type` ni `game_category` como parámetros de query.

**Solución:** Añadidos ambos parámetros al endpoint con sus filtros SQLAlchemy correspondientes.

**Archivos afectados:** `backend/routers/replays.py`

### BUG-03 — `game_category` y `playlist_id` ausentes en respuesta API

**Síntoma:** Campos `game_category` y `playlist_id` existían en el modelo pero no se incluían en `replay_to_dict()`.

**Solución:** Añadidos ambos campos al helper `replay_to_dict()`.

**Archivos afectados:** `backend/routers/replays.py`

### BUG-04 — Docstring incorrecto en replay_frames.py

**Síntoma:** Docstring del módulo describía cada entrada de `cars` como `[t, car_idx, x, y, z, yaw, pitch, roll]` (8 campos) cuando en realidad son 6: `[t, car_idx, x, y, z, yaw]`.

**Solución:** Corregido el docstring.

---

## 3. Plan de pruebas futuras

### 3.1 Pruebas de regresión automatizables

Estas pruebas son buenas candidatas para automatizar con `pytest`:

```
tests/
├── test_api_replays.py       # todos los endpoints de replays
├── test_api_stats.py         # endpoints de stats
├── test_replay_frames.py     # deduplicación de actores (unit tests)
├── test_parser.py            # parseo de .replay con subtr-actor
└── conftest.py               # BD de test con replays de muestra
```

**Casos prioritarios:**
- Deduplicación de coches: dado un JSON de rrrocket conocido, verificar `n_players` correcto
- Filtros de lista: cada combinación de filtros devuelve el subconjunto correcto
- Parseo de replay: dado un `.replay` de muestra, verificar campos extraídos

### 3.2 Casos de prueba pendientes

| ID | Descripción | Prioridad |
|----|-------------|-----------|
| T-P01 | Replay de partida 1v1 — verificar `n_players = 2` | Alta |
| T-P02 | Replay de partida 3v3 — verificar `n_players = 6` | Alta |
| T-P03 | Replay con todos los jugadores Epic — visor muestra `Car_N` para todos | Media |
| T-P04 | Replay con todos jugadores PSN/Steam — todos tienen nombre visible | Media |
| T-P05 | Replay muy corto (< 30s, rendición) — visor carga correctamente | Media |
| T-P06 | Watcher detecta nuevo `.replay` copiado a la carpeta | Alta |
| T-P07 | Mismo `.replay` procesado dos veces — no se duplica en BD | Alta |
| T-P08 | Backend caído — frontend muestra estado de error en todas las páginas | Media |
| T-P09 | tracker.gg no disponible — perfil carga desde caché en disco | Media |
| T-P10 | `rrrocket.exe` no encontrado — error claro en respuesta de frames | Alta |
| T-P11 | Archivo `.replay` movido/borrado — visor muestra error 404 claro | Media |
| T-P12 | Replay con overtime — goals en timeline correctamente posicionados | Media |
| T-P13 | Resize de ventana Electron — canvas del visor se redimensiona | Baja |
| T-P14 | Zoom máximo/mínimo OrbitControls — sin crash | Baja |

### 3.3 Pruebas de rendimiento

| Escenario | Métrica objetivo |
|-----------|-----------------|
| Carga inicial dashboard (BD con 100+ replays) | < 1s |
| Primera extracción de frames (replay ~5min) | < 30s |
| Carga de frames desde caché | < 500ms |
| Reproducción 3D a 2× en hardware de gama media | 60 fps sin caídas |
| Parseo de replay nuevo detectado por watcher | < 10s desde detección hasta BD |

---

## 4. Herramientas de diagnóstico integradas

El backend incluye endpoints de debug que facilitan la resolución de problemas:

| Endpoint | Uso |
|----------|-----|
| `GET /api/replays/{id}/frames/debug` | Inspecciona JSON raw de rrrocket — ver actores, objeto names, sample de RigidBody |
| `GET /api/replays/debug/viewer-check` | Verifica si rrrocket.exe existe y si el primer replay tiene archivo accesible |
| `GET /api/profile/debug-stats` | Ver qué claves de stats expone tracker.gg por playlist |
| `GET /docs` | Swagger UI — probar cualquier endpoint interactivamente |

### Script de diagnóstico rápido (PowerShell)

```powershell
# Verificar que el backend responde
Invoke-RestMethod http://localhost:8000/api/status

# Verificar un replay específico
Invoke-RestMethod http://localhost:8000/api/replays/116

# Comprobar frames 3D (puede tardar ~20s la primera vez)
Invoke-RestMethod http://localhost:8000/api/replays/116/frames | Select-Object duration, players, @{n='n_ball';e={$_.ball.Count}}, @{n='n_car';e={$_.cars.Count}}
```
