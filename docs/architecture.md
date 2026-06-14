# Arquitectura Técnica — RLAnalyzer

> Versión: 0.3.0 — Actualizado: 2026-05-29

---

## Visión general

RLAnalyzer es una aplicación de escritorio Windows que procesa archivos `.replay` de Rocket League y los presenta en un dashboard visual con estadísticas, historial de MMR y un visor 3D interactivo. La arquitectura sigue un modelo cliente-servidor local donde Electron actúa como shell del sistema operativo, React como UI y FastAPI como backend de datos.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron (main.js)                       │
│  ┌──────────────────────┐    ┌──────────────────────────────┐   │
│  │  React 18 + Vite     │    │  FastAPI + Uvicorn           │   │
│  │  (puerto 5173)       │◄──►│  (puerto 8000)               │   │
│  │                      │    │                              │   │
│  │  Dashboard           │    │  /api/replays                │   │
│  │  ReplayList          │    │  /api/stats                  │   │
│  │  ReplayDetail        │    │  /api/profile                │   │
│  │  ReplayViewer (3D)   │    │  /api/status                 │   │
│  │  Profile             │    │                              │   │
│  └──────────────────────┘    └──────────────┬───────────────┘   │
│                                             │                   │
│                              ┌──────────────▼───────────────┐   │
│                              │  SQLite  (rl_data.db)        │   │
│                              │  subtr-actor-py (parser)     │   │
│                              │  rrrocket.exe (3D frames)    │   │
│                              │  watchdog (file watcher)     │   │
│                              └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Capas del sistema

### 1. Electron (`electron/`)

Shell de escritorio. Responsabilidades:

- Crea la ventana frameless (sin barra de título nativa)
- Spawns del proceso backend (`python main.py`) y frontend (`npm run dev` o dist)
- Cierra ambos procesos cuando el usuario cierra la ventana
- Expone IPC a la UI vía `preload.js` (contextIsolation activado):
  - `minimize / maximize / close / isMaximized / onMaximizeChange`
  - `showReplayInFolder(path)` — abre el explorador con el `.replay` seleccionado
  - `exportReplay(path)` — copia el archivo a una ruta elegida por el usuario
  - `bcViewOpen(url, bounds) / bcViewSetBounds(bounds) / bcViewClose()` — controla un `WebContentsView` que embebe el visor de Ballchasing

**Visor embebido de Ballchasing (`WebContentsView`):**
El visor 3D de Ballchasing necesita WebGL/GPU real, que un `<webview>` no garantiza. Por eso se usa un `WebContentsView` adjunto a la ventana principal (misma ruta de render de Chromium), posicionado sobre la zona del visor de React mediante `setBounds`. Los popups/enlaces externos se abren en el navegador del sistema. La vista se destruye al cerrar el visor o la app.

**Archivos clave:**
- `electron/main.js` — ventana + procesos hijo + IPC handlers + `WebContentsView`
- `electron/preload.js` — bridge seguro `contextBridge.exposeInMainWorld("electronAPI", …)`

### 2. Frontend (`frontend/`)

React 18 con Vite. Sin state manager global (todo local con `useState`/`useEffect`).

**Rutas:**

| Ruta | Componente | Descripción |
|------|------------|-------------|
| `/` | `Dashboard.jsx` | KPIs, gráficos personales (tarta, tiros, forma) y filtros |
| `/analysis` | `Analysis.jsx` | Comparativa V/D vs compañeros/rivales + drill-down "¿Por qué?" |
| `/compare` | `Compare.jsx` | Comparar dos partidas (yo + totales de equipo y rival) con delta y resumen |
| `/replays` | `ReplayList.jsx` | Lista paginada con filtros (+ modo "Comparar" para elegir 2 partidas) |
| `/replays/:id` | `ReplayDetail.jsx` | Detalle de una partida, comparativa |
| `/viewer` | `ViewerList.jsx` | Listado de replays para abrir en el visor |
| `/viewer/:id` | `ReplayViewer.jsx` | Visor 3D Three.js + visor embebido de Ballchasing |
| `/profile` | `Profile.jsx` | Rangos, MMR, historial tracker.gg |
| `/players/:name` | `PlayerHistory.jsx` | Récord con/contra un jugador |

**Ajustes** no es una ruta: es un **modal** (`components/SettingsModal.jsx`) que se abre con el botón de
engranaje del Sidebar. Contiene secciones (Perfil/Replays/Avanzado) pensadas para crecer (apariencia,
privacidad, actualizaciones…). Jugador principal (multi-perfil) y carpeta de replays se editan ahí.

**Cliente HTTP (`api.js`):** caché en memoria por URL con TTL 60s. Todas las peticiones van a `http://localhost:8000`.

**Estilos:** Tailwind CSS utility-first. Colores base: azul oscuro (`#0A1929`), naranja (`#FF7A00`), acento azul (`#3A8EFF`).

**Componentes compartidos:**
- `TitleBar.jsx` — barra de título personalizada con controles min/max/close vía IPC
- `Sidebar.jsx` — navegación lateral
- `StatCard.jsx` — tarjeta de estadística reutilizable
- `AbnormalHelp.jsx` — icono "?" con tooltip que explica qué es una partida anómala (Dashboard y Análisis)

**Utilidades (`src/utils/`):**
- `mapNames.js` — nombres legibles de mapas
- `compareStats.js` — lógica pura del comparador de partidas: resuelve mi equipo/rival, agrega por equipo (suma para recuentos, media para `avg_boost`/`avg_speed`, `shooting_pct` derivado), calcula el delta con color según `higher_better` y genera el resumen "qué hiciste distinto". Replica el cálculo del backend para que los números cuadren con `/api/stats/analysis`.

### 3. Backend (`backend/`)

FastAPI con Uvicorn. Puerto 8000. Base de datos local SQLite.

**Ciclo de vida (startup):**
1. `init_db()` — crea tablas si no existen
2. `scan_existing_replays()` — detecta `.replay` en la carpeta que no estén en BD
3. `ReplayWatcher.start()` — inicia watchdog para detectar nuevos archivos
4. `asyncio.create_task(process_pending_loop())` — bucle cada 5s que procesa la cola
5. `delete_invalid_replays()` — elimina partidas no válidas (corruptas/no-partidas) que ya estuvieran en la BD
6. `asyncio.create_task(advanced_backfill_loop())` — bucle que calcula stats avanzadas pendientes en 2º plano (~1 partida cada 12s; pausable desde Ajustes; las no calculables se marcan intentadas para llegar al 100%)

**Validación de partidas:** `events.is_valid_match(data)` rechaza replays sin mapa o con < 2 jugadores
(corruptos, freeplay, menú): `save_replay_to_db` **no los inserta**, los registra en `events` y el frontend
muestra una **notificación del sistema** (toggle `notify_corrupt` en Ajustes). Las ya guardadas se borran al arrancar.

**Feed de notificaciones:** `events` mantiene una cola en memoria de avisos tipados — `match_added`
(partida nueva añadida), `corrupt` (no añadida) y `parse_error` (replay ilegible). `save_replay_to_db`
y `process_pending_loop` los publican; el frontend sondea `GET /api/notifications?since=<seq>` cada 30s.
El **filtrado por toggles se hace en el backend** (lee `notify_match_added` / `notify_corrupt` /
`notify_parse_error` frescos en cada llamada), de modo que activar/desactivar un tipo en Ajustes surte
efecto en el siguiente sondeo sin recargar; `last_seq` es siempre el global (el cliente no re-notifica
lo visto ni revive lo filtrado). `GET /api/replays/rejected` sigue como el subconjunto `corrupt`.

**Módulos:**

| Archivo | Responsabilidad |
|---------|----------------|
| `main.py` | Punto de entrada, lifespan, CORS, routers |
| `config.py` | `PLAYER_NAME`, `REPLAYS_FOLDER`, `DB_PATH`, `BACKEND_PORT` |
| `models.py` | SQLAlchemy models: `Replay`, `PlayerStat`, `Setting` |
| `database.py` | Engine SQLite, `SessionLocal`, `get_db`, `_migrate()` (ALTER TABLE) |
| `parser.py` | Parseo de `.replay` con subtr-actor-py |
| `watcher.py` | `ReplayWatcher` (watchdog), cola de pendientes |
| `replay_frames.py` | Extracción de frames 3D con rrrocket (`_parse_rrrocket`, `get_frames_cached`) |
| `advanced_stats.py` | `compute_advanced(frames)` — posesión y posicionamiento (puro) |
| `events.py` | `is_valid_match()` (rechaza corruptos/no-partidas) + feed en memoria de notificaciones tipadas (añadidas/corruptas/errores) |
| `field_constants.py` | Geometría del campo (porterías, conversión a metros) |
| `routers/replays.py` | `/api/replays/*`, `/{id}/frames`, `/{id}/advanced`, `/api/stats/summary`, `/me`, `/api/status` |
| `routers/stats.py` | Análisis y Dashboard: `/api/stats/analysis`, `/trend`, `/dashboard`, `/glossary`, `/analysis/filters`, `/advanced/status` |
| `routers/players.py` | Historial con/contra otros jugadores: `/api/players/*` |
| `routers/viewer.py` | Subida y URL de visor de Ballchasing: `/api/replays/{id}/ballchasing` |
| `routers/profile.py` | Endpoints `/api/profile/*`, caché tracker.gg |
| `routers/settings.py` | `GET/PUT /api/settings` — jugador y carpeta configurables |
| `settings_store.py` | Accesor de ajustes (tabla `settings`) con caché y fallback a `config.py` |

**Configuración en runtime (`settings_store.py` + tabla `settings`):** `PLAYER_NAME` y
`REPLAYS_FOLDER` se leen por función desde la tabla `settings` (con fallback a `config.py`), de modo
que se pueden cambiar desde Ajustes sin editar código ni reiniciar. Cambiar el jugador principal
re-etiqueta `is_me` en `player_stats` **y recalcula `Replay.my_team`/`Replay.result` desde la
perspectiva del nuevo jugador** en las partidas donde aparece (si estuvo en el equipo rival, su V/D
se corrige). Limitación: las partidas donde el nuevo jugador no aparece conservan su result antiguo y
quedan fuera de las stats personales, pero aún se cuentan en `/stats/summary`. Cambiar la carpeta
reinicia el watcher y re-escanea. `DB_PATH`/`BACKEND_PORT`/`TIMEZONE` siguen siendo solo de arranque.

> **Papel de `config.py` hoy:** es **legacy** — antes era el "panel de control" del desarrollador
> (de ahí su cabecera original "único archivo que editar"). Ahora el jugador y la carpeta se
> configuran desde **Ajustes** (BD), que tiene prioridad. `PLAYER_NAME`/`REPLAYS_FOLDER` en
> `config.py` quedan solo como **valores por defecto / red de seguridad**: se usan en el primer
> arranque (tabla `settings` vacía) o como respaldo. Editarlos solo sirve si quieres arrancar ya
> 100% configurado sin abrir Ajustes. La única parte de `config.py` que es imprescindible y
> permanente son `BASE_DIR`/`DB_PATH` (ubicación de la BD; no puede guardarse dentro de la BD) y
> `BACKEND_PORT` (el servidor debe conocer el puerto antes de leer nada). La app **nunca escribe**
> en `config.py`.

**Stats avanzadas (posición y posesión) — cálculo perezoso + backfill:** `advanced_stats.compute_advanced(frames)`
calcula, a partir de las posiciones por frame (salida de `_parse_rrrocket`): **posesión** (% de tiempo siendo el
coche más cercano al balón, 3D), **distancia media a portería propia** y **al compañero** (2D, en metros vía
`field_constants`) y **% de tiempo en campo rival**. Se exponen como columnas nullable en `player_stats`
(`possession_pct`, `avg_dist_to_goal`, `avg_dist_to_teammate`, `time_offensive_half_pct`, `advanced_computed`) y
como grupo `positioning` en `METRICS` (aparecen en Análisis). El cálculo es **perezoso y persistido**:
`GET /api/replays/{id}/advanced` calcula la 1ª vez (extrae frames con rrrocket, mapea idx→`PlayerStat` por
nombre/equipo con fallback por orden, persiste) y después sirve de BD. Además, `advanced_backfill_loop()` calcula
en segundo plano las partidas pendientes (pausable con el setting `advanced_background`); progreso en
`GET /api/stats/advanced/status`. Matiz: el agregado de Análisis para `positioning` solo refleja partidas ya
calculadas. **Pendiente de validar**: la orientación del eje de portería en `field_constants.own_goal_y`.

### 4. Base de datos

SQLite en `data/rl_data.db`. Tablas: `replays`, `player_stats` y `settings` (key/value de ajustes en runtime).
Las columnas nuevas se añaden con `ALTER TABLE` en `database._migrate()` (sin perder datos).

#### `replays`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | INTEGER PK | |
| `file_path` | STRING UNIQUE | Ruta absoluta al `.replay` |
| `file_name` | STRING | Nombre del archivo |
| `map_name` | STRING | Mapa (DFH Stadium, etc.) |
| `match_type` | STRING | `Ranked`, `Casual`, etc. |
| `game_category` | STRING | `Ranked`, `Extra`, `Casual` |
| `team_size` | INTEGER | 1, 2 o 3 |
| `playlist_id` | INTEGER | ID de playlist de RL |
| `duration_secs` | FLOAT | Duración en segundos |
| `played_at` | DATETIME | Fecha/hora de la partida |
| `result` | STRING | `win`, `loss`, `unknown` |
| `my_team` | INTEGER | Equipo del jugador (0 o 1) |
| `team0_score` | INTEGER | Goles equipo 0 |
| `team1_score` | INTEGER | Goles equipo 1 |
| `is_solo_queue` | BOOLEAN | |
| `is_favorite` | BOOLEAN | Marcado manualmente |
| `raw_meta` | TEXT | JSON crudo de subtr-actor (debug) |
| `processed_at` | DATETIME | Timestamp de procesado |

#### `player_stats`

Un registro por jugador por partida. Campos: `player_name`, `platform_id`, `team`, `is_me`, `score`, `goals`, `assists`, `saves`, `shots`, `demos_inflicted`, `boost_collected`, `boost_stolen`, `boost_wasted`, `avg_boost`, `avg_speed`, `time_supersonic`, `time_boost_speed`, `time_slow`, `time_on_ground`, `time_low_air`, `time_high_air`, `total_distance`. Stats avanzadas (calculadas perezosamente de los frames): `possession_pct`, `avg_dist_to_goal`, `avg_dist_to_teammate`, `time_offensive_half_pct`, `advanced_computed`.

`is_me = True` en el registro del jugador **activo** (de Ajustes; por defecto `config.PLAYER_NAME`). Cambiar de jugador re-etiqueta `is_me`.

---

## Parseo de replays

### Fase 1 — Metadata y stats (subtr-actor-py)

`parser.py` invoca la binding Python de `subtr-actor` (compilada con Rust/cargo). Extrae del header del replay:
- Metadata: mapa, modo, tamaño de equipos, fecha, duración
- Stats de jugadores: goles, asistencias, paradas, tiros, boost, velocidades
- Resultado: determinado comparando qué equipo tiene más goles y en qué equipo está `PLAYER_NAME`

### Fase 2 — Network frames para el visor 3D (rrrocket)

`replay_frames.py` invoca `tools/rrrocket.exe -n <replay>` que parsea los network frames del replay (posiciones físicas en tiempo real) y devuelve un JSON con la estructura de actores por frame.

#### Actor State Machine

rrrocket 0.11+ modela el juego como un stream de eventos de actores:

```
new_actors    → actor creado  (con object_id → nombre de clase)
updated_actors → atributos actualizados  (RigidBody, ActiveActor, UniqueId, …)
deleted_actors → actor destruido
```

Los tipos de actores relevantes:
- `Archetypes.Ball.Ball_Default` → balón
- `Archetypes.Car.Car_Default` → coche de jugador
- `TAGame.Default__PRI_TA` → PlayerReplicationInfo (identidad del jugador)

#### Deduplicación de coches

En Rocket League cada coche se destruye y recrea en cada reset (tras gol, inicio). En una partida 2v2 típica hay ~113 spawns de `Car_Default`. Sin deduplicación cada spawn crearía un slot de jugador nuevo.

La deduplicación usa una cadena de dos niveles:

```
Car actor  ──[ActiveActor.actor]──►  PRI actor
                                         │
                                    [UniqueId]
                                         │
                                    uid_to_player dict
                                    (clave estable entre respawns de PRI)
```

1. `car_ids[car_aid] = player_idx` — asignación provisional al crear el coche
2. Cuando llega `ActiveActor` en el coche: se obtiene el `PRI actor_id`
3. Si el PRI ya tiene slot conocido → reutilizar ese slot (coche respawneado)
4. `UniqueId` en el PRI proporciona identidad estable entre respawns del propio PRI

#### Limitación conocida — Epic Games

Los jugadores con cuenta Epic tienen `UniqueId.remote_id.Epic` con solo un hash numérico, sin campo `name`. Resultado: su nombre visible en el visor es `Car_0`, `Car_1`, etc. Jugadores de PSN y Steam sí exponen nombre en `UniqueId.remote_id.{Platform}.name`.

#### Caché de frames

Los frames extraídos se guardan en `data/frames/<replay_id>.json` (JSON compacto sin espacios). Las siguientes cargas del visor van directo a esta caché. Primera extracción: 15-30s. Se invalida si `duration == 0` o no hay `ball` frames.

---

## Visor 3D (Three.js)

`ReplayViewer.jsx` monta una escena Three.js con:

| Elemento | Implementación |
|----------|---------------|
| Campo | `PlaneGeometry` bicolor (azul/naranja por mitad) con líneas blancas |
| Paredes | `BoxGeometry` translúcidas con `side: THREE.BackSide` |
| Porterías | `LineSegments` con marco + cilindros de anillos |
| Boost pads grandes | `CylinderGeometry` amarillos en las 6 posiciones estándar |
| Balón | `SphereGeometry` blanco con efecto escala en gol |
| Coches | `BoxGeometry` coloreado por equipo, rotación por yaw |
| Etiquetas | HTML overlay posicionadas con `Vector3.project(camera)` |
| Goles | Torus rings expandiéndose + pulso del balón |

**Reproducción:**
- `requestAnimationFrame` avanza tiempo según `speed` (0.5×, 1×, 2×, 4×)
- `getBallAtTime(t)` y `getCarsAtTime(t)` usan búsqueda binaria + interpolación lineal
- `OrbitControls` para cámara libre
- `ResizeObserver` para redimensionar canvas

---

## Análisis y estadísticas (`routers/stats.py`)

Todo el análisis de comportamiento se construye sobre una única lista de métricas (`METRICS`) y un conjunto de helpers compartidos.

**Métricas:** cada métrica declara `key`, `label`, `group` (offense/defense/boost/movement), `higher_better`, `unit`, `desc` y `source`. Las derivadas (p. ej. `shooting_pct = goles ÷ tiros × 100`) se calculan en `_metric_value()`. El endpoint `/glossary` expone esta tabla para la ayuda de la UI.

**Roles:** para cada partida, cada jugador se clasifica como `me`, `teammates` o `opponents` según `replay.my_team`. Esto permite comparar tus medias con las de compañeros y rivales del mismo set de partidas.

**Partidas anómalas:** `_is_abnormal()` marca como no representativas las partidas demasiado cortas (rendición, `< min_duration`) o con diferencia de goles excesiva (paliza, `>= max_goal_diff`). Regla clave: las anómalas **cuentan para el win rate y el recuento**, pero **se excluyen de las medias** cuando `exclude_abnormal=true`.

**Filtros compartidos:** `_filtered_replays()` aplica modo, categoría y rango de fechas a nivel de query SQLAlchemy.

**Endpoints:**
- `/analysis` — medias global/victorias/derrotas por métrica y por rol.
- `/trend` — agrupa por semana/mes (lunes como inicio de semana) → win rate y medias por periodo.
- `/dashboard` — datos personales del jugador para la portada: KPIs, `play_style` (tarta goles/paradas/asistencias), `shooting` (goles vs tiros + %), `series` por día/semana y `recent_form` (últimas 15, que ignora el filtro de resultado).
- `/analysis/filters` y `/glossary` — metadatos para poblar la UI.

> **Contrato de la UI:** `team_sizes` y `categories` de `/analysis/filters` son arrays de objetos `{value, games}`. La UI debe leer `.value`; renderizar el objeto directo en JSX lanza "Objects are not valid as a React child" y desmonta el árbol.

**Comparador de dos partidas (`Compare.jsx`):** no añade endpoints. Pide los dos replays con `GET /api/replays/{id}` y la tabla de métricas con `GET /api/stats/glossary`, y hace todo el cálculo en el cliente (`utils/compareStats.js`) reutilizando las mismas reglas de agregación y `higher_better`. Compara tres roles —yo, mi equipo (agregado), equipo rival (agregado)— porque los compañeros/rivales individuales no son los mismos entre partidas distintas.

---

## Perfil tracker.gg

Estrategia de datos en capas:

```
1. Memoria en proceso (< 10 min)   → respuesta inmediata
2. API tracker.gg                  → TRN-Api-Key aprobada → datos en ~1s
3. Scraping HTTP                   → extrae __INITIAL_STATE__ del HTML
                                     (falla: tracker.gg carga datos via JS)
4. Playwright headless             → Chromium real, captura la API call del
                                     sitio con cookies de sesión → ~15s
5. Caché en disco                  → offline-first (sin TTL)
6. Error 503                       → si no hay datos en ninguna capa
```

**Comportamiento de bloqueo:**
- HTTP 429 (rate limit) → bloquea reintentos de la API durante 30 min
- HTTP 403 "not approved" → no bloquea; se reintenta en cada request y siempre cae a Playwright
- `POST /api/profile/invalidate` → resetea todo incluyendo el bloqueo

**Por qué falla el scraping HTTP:**
tracker.gg es una SPA Vue.js. El HTML inicial tiene `window.__INITIAL_STATE__` con el store de Vuex vacío (`stats.segments: []`). Los datos reales se cargan client-side vía llamadas a `api.tracker.gg` que incluyen cookies de sesión. Sin un navegador real que ejecute el JS y maneje las cookies, el scraping HTTP no puede obtener los datos.

**Playwright:** lanza Chromium headless, navega la página, intercepta la respuesta de `api.tracker.gg` que el propio sitio hace (con sus cookies), y la parsea con `_parse()`. Los datos obtenidos se cachean en disco automáticamente.

**Dependencia Playwright:**
```bash
pip install playwright
python -m playwright install chromium   # ~130 MB, instalado por setup.bat
```
Si no está instalado, la capa 4 se salta silenciosamente y se pasa a la caché en disco.

---

## Configuración

`backend/config.py`:
```python
PLAYER_NAME    = "GustoffotsuG"           # nombre exacto en Rocket League
REPLAYS_FOLDER = r"C:\...\DemosEpic"      # carpeta de replays
DB_PATH        = r"data\rl_data.db"
BACKEND_PORT   = 8000
TIMEZONE       = "Europe/Madrid"
```

`backend/.env` (opcional, no en git):
```
TRACKER_API_KEY=tu-api-key-aqui
```
