# Roadmap — RLAnalyzer

> Estado actual: v0.4.0 — Tests automatizados + Ajustes en la app (multi-perfil y carpeta configurable)

---

## Estado actual

- **Visor 3D** operativo: campo, coches, balón y etiquetas de jugadores, timeline con marcadores de gol, controles de velocidad y cámara libre. Visor embebido de Ballchasing como alternativa.
- **Dashboard** estilo RL Tracker: KPIs, gráficos personales (estilo de juego, goles vs tiros, forma reciente) y filtros por modo/periodo/resultado.
- **Análisis**: comparativa victorias vs derrotas y frente a compañeros/rivales, con drill-down "¿Por qué?" y evolución temporal.
- **Comparar**: dos partidas lado a lado (yo + totales de equipo y rival) con delta coloreado y resumen "qué hiciste distinto".
- **Historial por jugador**: récord con/contra cualquier jugador.
- **Ajustes** (modal): jugador principal (multi-perfil) y carpeta de replays configurables sin editar código; cambios en caliente.

---

## Completado recientemente

### v0.4.0
- ✅ **Tests automatizados del backend** — 60 tests con pytest (SQLite en memoria, sin red ni binarios), red de seguridad para iterar.
- ✅ **Configuración desde la app** — modal de Ajustes con jugador principal y carpeta de replays (tabla `settings` + `settings_store`), selector de carpeta nativo en Electron.
- ✅ **Multi-perfil** — cambiar el jugador principal re-etiqueta `is_me` y recalcula V/D al instante (sin reiniciar); la vista se recarga sola.
- ✅ **Reinicio del backend sin cerrar la app** (Electron) y puertos centralizados/overridables por entorno.

### v0.3.1
- ✅ **Comparativa entre dos partidas** — seleccionar dos replays y comparar stats lado a lado (yo / mi equipo / equipo rival) con indicadores de mejora/empeoramiento.
- ✅ **Retoques del Dashboard** — legibilidad de tooltips, indicador de partidas anómalas, botón al visor 3D en las últimas partidas y ayuda contextual sobre partidas anómalas.

### v0.3.0
- ✅ **Dashboard de tendencias temporales** — gráficos de win rate y medias por día/semana, filtrables por modo, periodo y resultado.
- ✅ **Comparativa de comportamiento** — medias en victorias vs derrotas y frente a compañeros/rivales (sección Análisis).

---

## Próximas funcionalidades

### P1 — Alta prioridad

#### Visor 3D: nombres para jugadores Epic
- **Problema:** Jugadores con cuenta Epic muestran `Car_0`, `Car_1` porque Epic no expone el gamertag en `UniqueId.remote_id`.
- **Solución propuesta:** Cruzar el `actor_id` con los datos de `PlayerStat.player_name` almacenados en la BD desde el header del replay. El header de subtr-actor sí contiene el nombre.
- **Archivos:** `replay_frames.py` (pasar nombres desde BD al parseo), `routers/replays.py` (pasarlos al endpoint de frames)

#### Visor 3D: barra de boost en tiempo real
- **Problema:** La barra de boost en la etiqueta del jugador muestra 33% fijo (placeholder).
- **Solución:** Parsear el atributo `Boost` (o `ReplicatedBoostAmount`) de los actores de boost de cada jugador en el actor state machine. Añadir `boost` como campo en el array de `cars`.
- **Archivos:** `replay_frames.py`

#### Tests automatizados básicos — ✅ Hecho (47 tests)
- ✅ Pytest con fixtures (SQLite en memoria + `dependency_overrides`), sin red ni binarios nativos
- ✅ Tests unitarios de helpers (`stats`, `players`, `profile._parse`) con JSON conocido
- ✅ Tests de integración de los endpoints principales (`/api/replays`, `/api/stats/*`, `/api/players/*`)
- Pendiente futuro: tests del parser real (`replay_frames`/`parser`) mockeando subtr_actor/rrrocket
- **Archivos:** `backend/tests/`, `backend/conftest.py`, `backend/requirements-dev.txt`

### P2 — Media prioridad

#### Visor 3D: heatmap de posiciones
- Acumulación de posiciones del balón y/o jugadores sobre el campo
- Vista de calor (gradiente) superpuesta sobre el campo en una pantalla de análisis
- Útil para ver zonas dominadas, tendencias ofensivas/defensivas

#### Visor 3D: velocímetro y speedlines
- Mostrar velocidad instantánea de cada coche (km/h o UU/s)
- Speedlines visuales cuando un coche supera velocidad supersónica

#### Estadísticas avanzadas de partida
- Posesión de balón por equipo/jugador (% tiempo que el jugador es el más cercano al balón)
- Distancia media del jugador a la portería propia (posicionamiento)
- Número de demos recibidos (ahora solo se guardan demos infligidos)

#### Exportar replay como video/GIF
- Capturar frames del canvas Three.js y codificar como video o GIF animado
- Útil para compartir momentos destacados

### P3 — Baja prioridad / Futuro

#### Tendencias de MMR en el Dashboard
- Integrar la evolución de MMR (de tracker.gg) junto a las tendencias de stats ya existentes

#### Sincronización en la nube (opcional)
- Subir replays procesados a un servicio externo para acceso desde otro PC
- Alternativa: exportar la BD SQLite como backup

#### Notificaciones de nuevos replays
- Toast o notificación del sistema operativo cuando se procesa un nuevo replay

---

## Deuda técnica

| ID | Descripción | Impacto |
|----|-------------|---------|
| DT-01 | ~~Sin tests automatizados~~ → suite pytest del backend (47 tests) | ✅ Resuelto (falta cubrir el parser nativo) |
| DT-02 | `raw_meta` en BD guarda JSON completo de subtr-actor (puede crecer) | Bajo |
| DT-03 | Caché de frames no se invalida si el `.replay` cambia o se mueve | Medio |
| DT-04 | ~~`PLAYER_NAME` hardcodeado en `config.py`~~ → configurable desde Ajustes (multi-perfil) | ✅ Resuelto |
| DT-05 | Sin manejo de errores en `watcher.py` para replays corruptos | Bajo |
| DT-06 | El cliente `api.js` no tiene reintentos ante fallos de red temporales | Bajo |

---

## Ideas descartadas / no planificadas

- **Parseo de replays en tiempo real** (mientras la partida ocurre): Rocket League no escribe el `.replay` hasta el final de la partida.
- **Análisis con IA** (GPT, modelos de lenguaje sobre los datos): Fuera del alcance del proyecto personal.
- **App web pública**: El modelo actual es local-first por diseño (acceso a archivos locales).
