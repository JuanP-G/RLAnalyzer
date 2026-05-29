# Changelog — RLAnalyzer

Todas las versiones notables se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/).

---

## [0.3.1] — 2026-05-29

### Añadido
- **Sección Comparar** (`frontend/src/pages/Compare.jsx`, ruta `/compare`, link en `Sidebar.jsx`)
  - Compara **dos partidas (A vs B)** mostrando tres roles: **tus** stats, el **agregado de tu equipo** y el del **equipo rival**
  - Columna de **delta (A−B) coloreada** verde/rojo según `higher_better` de cada métrica (gris si neutral o falta dato)
  - Panel automático **"qué hiciste distinto"** que destaca las métricas con mayor diferencia relevante
  - Tabla por grupos (Ofensiva/Defensa/Boost/Movimiento) con todas las métricas del glosario
  - Dos accesos: selectores propios en la sección + modo **"Comparar"** en la lista de Partidas (elegir 2 → `/compare?a=&b=`)
  - Lógica pura en `frontend/src/utils/compareStats.js` (suma para recuentos, media para `avg_boost`/`avg_speed`, `shooting_pct` derivado). **Sin cambios de backend**: reutiliza `GET /api/replays/{id}` y `GET /api/stats/glossary`
  - Avisos para partida repetida y para tamaños de equipo distintos (los totales de equipo no son directamente comparables)

### Corregido / mejorado
- **Legibilidad de gráficos del Dashboard**: el tooltip de la tarta "Estilo de juego" usaba texto oscuro ilegible sobre fondo oscuro; ahora usa texto claro (`itemStyle`/`labelStyle`)
- **Indicador de partida anómala** en "Últimas partidas" del Dashboard (badge ⚠ con tooltip explicando rendición corta o paliza)
- **Botón "3D"** en cada partida reciente del Dashboard, reutilizando el estilo del botón de la lista de Partidas
- **Ayuda contextual** (`frontend/src/components/AbnormalHelp.jsx`): icono "?" junto a "Excluir anómalas" en Dashboard y Análisis, con tooltip que explica los umbrales
- **Umbral de duración** de partida anómala reducido de **240s → 180s** (`DEFAULT_MIN_DURATION` en `stats.py`, estado de `Analysis.jsx` y docs)

### Documentación
- `README.md`, `docs/architecture.md`, `docs/api-reference.md`, `docs/changelog.md`, `docs/roadmap.md` actualizados con la sección Comparar y los retoques del Dashboard
- Documentos Word (`RLAnalyzer-Documentacion-Tecnica.docx`, `RLAnalyzer-Plan-de-Proyecto.docx`) actualizados

---

## [0.3.0] — 2026-05-29

### Añadido
- **Sección Análisis** (`frontend/src/pages/Analysis.jsx`, ruta `/analysis`, link en `Sidebar.jsx`)
  - Comparativa de tus medias en **victorias vs derrotas**, métrica a métrica
  - Comparativa frente a **compañeros** y **rivales** del mismo set de partidas
  - Drill-down **"¿Por qué?"**: al expandir una métrica se muestran las métricas relacionadas que explican la diferencia, por actor (yo/compañeros/rivales)
  - Filtros por modo, categoría y fechas; exclusión de partidas anómalas configurable
- **Router de estadísticas** (`backend/routers/stats.py`) registrado en `main.py`
  - `GET /api/stats/analysis` — medias global/victorias/derrotas por métrica y rol
  - `GET /api/stats/trend` — evolución temporal por semana/mes
  - `GET /api/stats/dashboard` — datos personales para el Dashboard
  - `GET /api/stats/analysis/filters` — opciones de filtro con nº de partidas
  - `GET /api/stats/glossary` — descripción y origen de cada métrica
  - Tabla central `METRICS` (offense/defense/boost/movement) con derivadas como `shooting_pct`
  - Detección de partidas anómalas (rendiciones cortas / palizas) que afectan a las medias pero no al win rate
- **Dashboard rediseñado** (`frontend/src/pages/Dashboard.jsx`) estilo RL Tracker
  - Gráficos: **Estilo de juego** (tarta goles/paradas/asistencias), **Tiros: goles vs tiros** (barras + línea de % de acierto con media móvil), **Forma reciente** (cuadros V/D)
  - Filtros: modo (1v1/2v2/3v3), periodo (todo / 7 / 30 / 90 días), resultado (V/D), excluir anómalas
  - Agrupación seleccionable por día o semana
  - Tabla de partidas recientes compacta
- **Visor embebido de Ballchasing** (`electron/main.js`, `preload.js`, `ReplayViewer.jsx`)
  - `WebContentsView` adjunto a la ventana principal (WebGL/GPU real) posicionado sobre la zona del visor
  - IPC `bcViewOpen / bcViewSetBounds / bcViewClose`; popups externos al navegador del sistema
  - `GET /api/replays/{id}/ballchasing` (`routers/viewer.py`) — sube el replay y devuelve la URL, con caché en `data/ballchasing_cache.json`
- **Historial por jugador** (`routers/players.py`, `PlayerHistory.jsx`)
  - `GET /api/players`, `/api/players/{name}/summary`, `/api/players/{name}/replays`

### Corregido
- **Dashboard en blanco**: el filtro de Modo trataba `team_sizes` (que `/api/stats/analysis/filters` devuelve como objetos `{value, games}`) como números, lo que lanzaba "Objects are not valid as a React child" y desmontaba todo el árbol de React. Corregido usando `ts.value` en `key`, `active` y el texto del pill.

### Documentación
- `README.md`: sección Dashboard y Análisis, características y estructura actualizadas
- `docs/api-reference.md`: endpoints de Stats, Jugadores y Ballchasing
- `docs/architecture.md`: rutas frontend, módulos backend, motor de análisis, visor embebido (v0.3.0)
- `docs/changelog.md`: esta entrada

---

## [Unreleased] — 2026-05-26 (actualizado)

### Añadido
- **Visor 3D interactivo** (`frontend/src/pages/ReplayViewer.jsx`)
  - Campo bicolor (azul equipo 0 / naranja equipo 1)
  - Coches 3D con etiquetas HTML por nombre de jugador
  - Balón con efecto de escala en gol
  - Efectos de gol: torus rings expansivos + pulso del balón
  - Timeline con marcadores clicables por gol
  - Controles de velocidad de reproducción: 0.5×, 1×, 2×, 4×
  - OrbitControls para cámara libre
  - Boost pads grandes en posiciones estándar de RL
- **Extracción de frames 3D** (`backend/replay_frames.py`)
  - Wrapper de `rrrocket.exe -n` con actor state machine completa
  - Deduplicación de coches por `ActiveActor` + `UniqueId`
  - Extracción de nombre de jugador desde `UniqueId.remote_id`
  - Caché en disco en `data/frames/<id>.json`
  - Muestreo 1:3 (30fps → ~10fps efectivos)
- **Electron desktop wrapper**
  - Ventana frameless con titlebar personalizado (`electron/main.js`)
  - `preload.js` con contextIsolation y `electronAPI` expuesto vía `contextBridge`
  - IPC: min/max/close, `showReplayInFolder`, `exportReplay`
  - TitleBar React con botones de ventana (`frontend/src/components/TitleBar.jsx`)
- **Perfil tracker.gg** con estrategia multi-capa (API → scraping → disco)
- **Detalle de replay mejorado**: SpeedInfoPanel, comparativa vs media histórica
- **Endpoints de diagnóstico**: `/api/replays/{id}/frames/debug`, `/api/replays/debug/viewer-check`, `/api/profile/debug-stats`

### Añadido (post-release)
- **Playwright headless** como fallback para perfil tracker.gg. tracker.gg carga los datos via JS client-side; el scraping HTTP obtiene el store de Vuex vacío. Playwright navega con Chromium real e intercepta la respuesta API del sitio (con sus cookies de sesión). Instalado automáticamente por `setup.bat`. Primera carga ~15s, siguientes desde caché disco.
- **`GET /api/profile/diagnose`** — endpoint de diagnóstico del sistema de perfil

### Corregido
- **Bug crítico — 21 jugadores en 2v2**: La deduplicación de coches usaba `PlayerReplicationInfo` (atributo inexistente en rrrocket 0.11+). Corregido usando `ActiveActor.actor` como link car→PRI y `UniqueId` para deduplicar respawns.
- **Filtros de lista ignorados**: `match_type` y `game_category` enviados por el frontend eran silenciosamente ignorados porque no estaban declarados como params del endpoint.
- **Campos faltantes en API**: `game_category` y `playlist_id` existían en el modelo pero no se incluían en `replay_to_dict()`.
- **Docstring incorrecto**: El módulo `replay_frames.py` documentaba 8 campos por entrada de `cars` cuando son 6.
- **Scraping bloqueaba Playwright**: `_blocked_until` impedía el scraping cuando la API devolvía 403. Renombrado a `_api_blocked_until`; Playwright siempre se intenta independientemente.
- **Path de `.env` incorrecto** en `_load_api_key()`: construía `backend/backend/.env` en lugar de `backend/.env`.
- **403 "not approved" activaba bloqueo de 30 min**: solo el 429 (rate limit) debería activarlo. Un 403 de key no aprobada se reintenta en cada request.

### Documentación
- `README.md` actualizado con sección de Visor 3D, estructura de archivos completa, tabla de stack y capa Playwright
- `docs/architecture.md` — arquitectura técnica completa, incluyendo la cadena de fallback de perfil actualizada
- `docs/api-reference.md` — referencia completa de la API REST
- `docs/testing.md` — pruebas manuales ejecutadas y plan de pruebas futuras
- `docs/changelog.md` — este archivo

---

## [0.1.0] — 2026-05-20 (commit: fb68962)

### Añadido
- Dashboard con KPIs (victorias, derrotas, win rate, últimas partidas)
- Lista de replays paginada con filtros básicos (resultado, favoritas, modo)
- Detalle de replay con equipos, jugadores y stats
- Procesado automático de replays con `subtr-actor-py`
- File watcher con `watchdog` para detectar nuevos `.replay`
- Bucle de background para procesar la cola de replays pendientes
- Base de datos SQLite con modelos `Replay` y `PlayerStat`
- API REST con FastAPI (replays, stats, perfil)
- Stack React 18 + Vite + Tailwind CSS
- Primer commit del proyecto

---

## Limitaciones conocidas

| ID | Descripción | Estado |
|----|-------------|--------|
| L-01 | Jugadores Epic no tienen nombre visible en el visor (solo `Car_N`) | Abierto — Epic no expone nombre en `UniqueId` |
| L-02 | Barra de boost en PlayerCard del visor muestra 33% fijo | Pendiente — requiere parsear boost per-frame |
| L-03 | Caché de frames no se invalida si el `.replay` se mueve o borra | Abierto |
| L-04 | Perfil solo disponible para jugadores de plataforma Epic configurados en `config.py` | Por diseño |
| L-05 | Sin tests automatizados | Pendiente |
