# ============================================================
#  config.py — RLAnalyzer
#  ÚNICO archivo que debes editar para configurar la app.
#  Si compartes la app con alguien, solo tiene que cambiar
#  los valores de esta sección.
# ============================================================

# Tu nombre exacto tal como aparece en Rocket League
PLAYER_NAME = "GustoffotsuG"

# Ruta a la carpeta donde Rocket League guarda los .replay
# Ruta típica en Windows con Epic Games o Steam:
REPLAYS_FOLDER = r"C:\Users\JPG\Documents\My Games\Rocket League\TAGame\DemosEpic"

# Ruta donde se guardará la base de datos SQLite
# (se crea automáticamente si no existe)
import os
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "rl_data.db")

# Puerto del servidor backend (no tocar salvo conflicto).
# Overridable por entorno (debe coincidir con electron/main.js y vite.config.js).
BACKEND_PORT = int(os.environ.get("RL_BACKEND_PORT", 8000))

# Zona horaria local para mostrar fechas correctamente
TIMEZONE = "Europe/Madrid"
