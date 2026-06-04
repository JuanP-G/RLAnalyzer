# ============================================================
#  config.py — RLAnalyzer
#
#  NO necesitas editar este archivo para usar la app: el jugador
#  y la carpeta de replays se configuran desde dentro de la app
#  (botón de Ajustes) y se guardan en la base de datos.
#
#  Estos valores son solo los POR DEFECTO / de respaldo: se usan
#  en el primer arranque (hasta que guardas algo en Ajustes) o si
#  la base de datos no tiene aún ese ajuste. Editarlos aquí solo
#  sirve si quieres que la app arranque ya configurada sin abrir
#  Ajustes (p. ej. para tu propio entorno de desarrollo).
#
#  Excepción: DB_PATH y BACKEND_PORT sí viven aquí de forma
#  permanente (la ubicación de la BD y el puerto del servidor no
#  pueden guardarse dentro de la propia BD).
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
