# Changelog — RLAnalyzer

Todas las versiones notables se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/).

---

## [Unreleased] — 2026-05-26

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

### Corregido
- **Bug crítico — 21 jugadores en 2v2**: La deduplicación de coches usaba `PlayerReplicationInfo` (atributo inexistente en rrrocket 0.11+). Corregido usando `ActiveActor.actor` como link car→PRI y `UniqueId` para deduplicar respawns.
- **Filtros de lista ignorados**: `match_type` y `game_category` enviados por el frontend eran silenciosamente ignorados porque no estaban declarados como params del endpoint.
- **Campos faltantes en API**: `game_category` y `playlist_id` existían en el modelo pero no se incluían en `replay_to_dict()`.
- **Docstring incorrecto**: El módulo `replay_frames.py` documentaba 8 campos por entrada de `cars` cuando son 6.

### Documentación
- `README.md` actualizado con sección de Visor 3D, estructura de archivos completa y tabla de stack
- `docs/architecture.md` — arquitectura técnica completa
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
