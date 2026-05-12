# RLAnalyzer

Aplicación de escritorio para analizar en profundidad tus partidas de Rocket League. Procesa automáticamente tus archivos `.replay`, los almacena en una base de datos local y los presenta en un dashboard visual con estadísticas detalladas, historial de MMR y datos de perfil de tracker.gg.

![RLAnalyzer](docs/screenshot.png)

---

## Características

- **Procesado automático de replays** — detecta nuevos `.replay` y los analiza sin intervención
- **Dashboard** — resumen de victorias, derrotas, win rate y últimas partidas
- **Lista de partidas** — paginada, con navegación y detalle de cada partida
- **Vista detallada** — equipos, jugadores, estadísticas de boost y movimiento
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

El perfil muestra rangos, MMR e historial desde [tracker.gg](https://rocketleague.tracker.network). Sin API key, la app intenta scraping de la web como fallback. Cuando consigas tu key:

1. Edita `backend/routers/profile.py`, línea ~18:
   ```python
   TRACKER_API_KEY = "tu-api-key-aqui"
   ```
2. Reinicia la app

Los datos se cachean en disco (sin expirar) para funcionar offline con los últimos datos conocidos.

---

## Estructura del proyecto

```
RLAnalyzer/
├── backend/                 # API REST — Python + FastAPI
│   ├── config.py            # ← EDITA ESTO con tus datos
│   ├── main.py              # Punto de entrada del servidor
│   ├── parser.py            # Parseo de .replay con subtr-actor
│   ├── watcher.py           # Vigilancia automática de la carpeta
│   ├── models.py            # Modelos SQLAlchemy
│   ├── database.py          # Conexión a SQLite
│   └── routers/
│       ├── replays.py       # Endpoints de partidas
│       └── profile.py       # Endpoints de perfil + caché tracker.gg
├── frontend/                # UI — React + Vite + Tailwind
│   ├── src/
│   │   ├── pages/           # Dashboard, ReplayList, ReplayDetail, Profile
│   │   ├── components/      # Sidebar, StatCard
│   │   └── api.js           # Cliente HTTP
│   └── public/
│       └── ranks/           # Iconos PNG de rangos (offline)
├── electron/                # Wrapper de escritorio
│   ├── main.js              # Gestiona ventana + procesos hijo
│   └── icon.ico             # Icono de la app
├── data/                    # Generado automáticamente
│   ├── rl_data.db           # Base de datos SQLite
│   └── profile_cache.json   # Caché de perfil tracker.gg
├── docs/                    # Documentación
├── tools/                   # rrrocket (herramienta auxiliar)
├── config.py → backend/config.py
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
| Frontend | React 18 + Vite + Tailwind CSS |
| Gráficos | Recharts |
| Desktop | Electron |
| Perfil | tracker.gg API / web scraping |

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
