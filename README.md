# RLAnalyzer

Aplicación de escritorio para analizar en profundidad tus partidas de Rocket League. Procesa automáticamente tus archivos `.replay`, los almacena en una base de datos local y los presenta en un dashboard visual con estadísticas detalladas, historial de MMR, datos de perfil de tracker.gg y un **visor 3D interactivo** de replays.

![RLAnalyzer](docs/screenshot.png)

---

## Características

- **Procesado automático de replays** — detecta nuevos `.replay` y los analiza sin intervención
- **Dashboard** — KPIs (victorias, derrotas, win rate), gráficos personales estilo RL Tracker (estilo de juego en tarta, goles vs tiros, forma reciente V/D) y filtros por modo, periodo y resultado
- **Análisis** — compara tus medias en victorias vs derrotas y frente a compañeros/rivales métrica a métrica, con desglose **"¿Por qué?"** que explica cada diferencia con métricas relacionadas, evolución temporal y exclusión de partidas anómalas
- **Comparar partidas** — enfrenta dos partidas (A vs B) mostrando tus stats, el total de tu equipo y el del rival, con delta coloreado por métrica y un resumen automático de **"qué hiciste distinto"**
- **Lista de partidas** — paginada, con filtros por resultado/modo/favoritas, modo "Comparar" para elegir dos partidas y detalle de cada partida
- **Historial por jugador** — récord con/contra cualquier jugador visto en tus partidas (win rate, medias comparadas)
- **Vista detallada** — equipos, jugadores, estadísticas de boost y movimiento, comparativa vs tu media histórica
- **Visor 3D** — reproduce el replay frame a frame con campo bicolor, coches 3D con etiquetas, efectos de gol y timeline con marcadores clicables, más un visor embebido de Ballchasing
- **Perfil** — rangos por modo (1v1, 2v2, 3v3, extras, casual), historial de MMR y estadísticas de carrera
- **Offline-first** — sirve los últimos datos conocidos cuando no hay conexión
- **App de escritorio** — ventana nativa de Windows sin necesidad de abrir el navegador

---

## Requisitos

| Herramienta | Versión mínima | Descarga |
|-------------|----------------|----------|
| Python | 3.10+ | https://python.org |
| Node.js | 18+ | https://nodejs.org |
| Rust (cargo) | estable | https://rustup.rs |

> Rust solo es necesario para compilar `subtr-actor-py` la primera vez. Si ya está instalado en tu sistema, el setup lo detecta automáticamente.
>
> `setup.bat` instala también **Playwright + Chromium** (~130 MB) para el perfil tracker.gg. Si la descarga falla, el resto de la app funciona con normalidad.

---

## Instalación

### 1. Clona el repositorio

```bash
git clone https://github.com/TU_USUARIO/RLAnalyzer.git
cd RLAnalyzer
```

### 2. Configura tus datos

Edita `backend/config.py`:

```python
PLAYER_NAME    = "TuNombreEnRocketLeague"   # nombre exacto en el juego
REPLAYS_FOLDER = r"C:\Users\TU_USUARIO\Documents\My Games\Rocket League\TAGame\DemosEpic"
```

### 3. Ejecuta el setup

```bat
setup.bat
```

Esto instala automáticamente:
- Dependencias Python (FastAPI, SQLAlchemy, etc.)
- `subtr-actor-py` compilado desde fuente (puede tardar 5-10 min la primera vez)
- **Playwright + Chromium** para el perfil tracker.gg (puede tardar 1-2 min)
- Dependencias npm del frontend
- Electron (wrapper de escritorio)
- Crea un acceso directo en tu escritorio

---

## Uso

**Abrir la app** — doble clic en el icono `RLAnalyzer` del escritorio, o ejecuta:

```bat
start-app.bat        # con ventana de consola (modo desarrollo/debug)
launch.vbs           # sin consola (modo normal)
```

La app arranca el backend y el frontend automáticamente y los cierra al cerrar la ventana.

**Primera vez sin replays** — si aún no tienes partidas procesadas, coloca algunos `.replay` en tu carpeta de Rocket League y la app los detectará y procesará en segundo plano.

---

## Perfil y tracker.gg

El perfil muestra rangos, MMR e historial desde [tracker.gg](https://rocketleague.tracker.network).

La app intenta obtener los datos en este orden:

1. **API tracker.gg** — si tienes API key y está aprobada
2. **Scraping HTTP** — intento rápido sin navegador
3. **Playwright headless** — Chromium real que carga la página completa (~15s, instala automáticamente con `setup.bat`)
4. **Caché en disco** — último dato guardado, funciona sin conexión

**API key (opcional):** cuando tracker.gg apruebe tu key de [tracker.gg/developers](https://tracker.gg/developers):
```
# backend/.env
TRACKER_API_KEY=tu-api-key-aqui
```

> Sin API key aprobada la app usa Playwright como fallback automático. Los datos se cachean en disco para uso offline.

> **Nota:** Las API keys de tracker.gg requieren aprobación manual. Contacta con ellos en su Discord si la key devuelve 403.

---

## Estructura del proyecto

```
RLAnalyzer/
├── backend/                 # API REST — Python + FastAPI
│   ├── config.py            # ← EDITA ESTO con tus datos (nombre, carpeta replays)
│   ├── .env                 # ← API keys (no se sube a git)
│   ├── main.py              # Punto de entrada del servidor
│   ├── parser.py            # Parseo de .replay con subtr-actor
│   ├── watcher.py           # Vigilancia automática de la carpeta
│   ├── replay_frames.py     # Extracción frame a frame con rrrocket (para el visor 3D)
│   ├── models.py            # Modelos SQLAlchemy
│   ├── database.py          # Conexión a SQLite
│   └── routers/
│       ├── replays.py       # Endpoints de partidas + frames
│       ├── stats.py         # Análisis y Dashboard (analysis, trend, dashboard, glossary)
│       ├── players.py       # Historial con/contra otros jugadores
│       ├── viewer.py        # Subida/visor de Ballchasing
│       └── profile.py       # Endpoints de perfil + caché tracker.gg
├── frontend/                # UI — React + Vite + Tailwind
│   ├── src/
│   │   ├── pages/           # Dashboard, Analysis, Compare, ReplayList, ReplayDetail, ReplayViewer, Profile, PlayerHistory
│   │   ├── components/      # Sidebar, StatCard, AbnormalHelp, TitleBar
│   │   ├── utils/           # mapNames, compareStats (lógica del comparador)
│   │   └── api.js           # Cliente HTTP con caché en memoria
│   └── public/
│       └── ranks/           # Iconos PNG de rangos (offline)
├── electron/                # Wrapper de escritorio
│   ├── main.js              # Gestiona ventana + procesos hijo + visor embebido (WebContentsView)
│   ├── preload.js           # Puente seguro IPC (contextIsolation)
│   └── icon.ico             # Icono de la app
├── data/                    # Generado automáticamente
│   ├── rl_data.db           # Base de datos SQLite
│   ├── profile_cache.json   # Caché de perfil tracker.gg
│   ├── ballchasing_cache.json # Caché de URLs subidas a Ballchasing
│   └── frames/              # Caché de frames 3D por replay (JSON compacto)
├── docs/                    # Documentación
├── tools/
│   └── rrrocket.exe         # Parser de network frames para el visor 3D
├── setup.bat                # Instalación inicial (ejecutar una vez)
├── start-app.bat            # Arranque con consola (debug)
├── launch.vbs               # Arranque sin consola (uso normal)
└── create-shortcut.bat      # Crea acceso directo en escritorio
```

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3 + FastAPI + Uvicorn |
| Base de datos | SQLite + SQLAlchemy |
| Parser de replays | subtr-actor-py (Rust → Python) |
| Parser de frames | rrrocket.exe (network frames) |
| Frontend | React 18 + Vite + Tailwind CSS |
| Visor 3D | Three.js + OrbitControls |
| Gráficos | Recharts |
| Desktop | Electron (frameless, custom titlebar) |
| Perfil | tracker.gg API / web scraping / caché offline |

---

## Dashboard y Análisis

Dos secciones distintas y complementarias, ambas centradas en tu jugador:

**Dashboard** (`/`) — vista rápida del estado actual:
- KPIs: partidas, victorias, derrotas, win rate y medias (goles, paradas, puntuación)
- **Estilo de juego** — tarta con el reparto goles / paradas / asistencias
- **Tiros: goles vs tiros** — barras de goles y tiros + línea de % de acierto
- **Forma reciente** — últimas 15 partidas como cuadros V/D
- Filtros: modo (1v1/2v2/3v3), periodo (todo / 7 / 30 / 90 días), resultado (V/D), excluir anómalas; agrupación por día o semana
- Tabla compacta de partidas recientes

**Análisis** (`/analysis`) — comparativas profundas para entender *por qué* ganas o pierdes:
- Tus medias **en victorias vs derrotas**, métrica a métrica
- Comparativa con **compañeros** y **rivales** del mismo set de partidas
- Desglose **"¿Por qué?"**: al expandir una métrica, se muestran las métricas relacionadas que explican la diferencia
- **Evolución temporal** por semana/mes
- Exclusión de partidas anómalas (rendiciones cortas o palizas) para no distorsionar las medias — el win rate siempre usa todas las partidas

> Las partidas anómalas se definen por defecto como menos de 180 s de duración o una diferencia de goles ≥ 5.

**Comparar** (`/compare`) — enfrenta dos partidas para ver qué hiciste distinto:
- Selecciona **dos partidas** (desde la sección o marcando dos en la lista de Partidas)
- Tres vistas: **tus** stats, el **total de tu equipo** y el del **equipo rival**
- Columna **Δ (A−B)** coloreada según si mejoras o empeoras en cada métrica
- Resumen automático **"qué hiciste distinto"** con las mayores diferencias

---

## Visor 3D

Desde el detalle de cualquier partida, pulsa **"Ver en 3D"** para abrir el visor interactivo.

- **Primera vez**: puede tardar 15-30 segundos mientras `rrrocket.exe` procesa los network frames. Las siguientes veces usa caché en disco (`data/frames/<id>.json`).
- **Controles de cámara**: arrastra para rotar, rueda para zoom, click derecho para desplazar.
- **Timeline**: haz clic en los marcadores de gol (líneas de color) para saltar al momento del gol.
- **Velocidad**: botones 0.5×, 1×, 2×, 4× en la esquina superior derecha.

> Los frames se cachean en `data/frames/`. Para forzar la re-extracción, borra el archivo `.json` correspondiente.

---

## Desarrollo

```bash
# Backend (puerto 8000)
cd backend && python main.py

# Frontend (puerto 5173)
cd frontend && npm run dev

# Abre http://localhost:5173 en el navegador
```

---

## Licencia

Uso personal. Sin licencia definida.
