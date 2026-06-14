"""
field_constants.py — RLAnalyzer
Geometría del campo de Rocket League (en Unreal Units). Aislada aquí para que, si
la orientación de algún eje hay que corregirla tras verificar con un replay real,
solo se toque un sitio.

Convención estándar de RL:
  - Línea de gol en Y = ±5120 (centro de portería ≈ (0, ±5120, 320)).
  - Paredes laterales en X = ±4096. Suelo Z≈0, techo Z≈2044.
  - 1 UU = 1 cm → metros = UU / 100.
"""

GOAL_Y        = 5120.0
GOAL_CENTER_Z = 320.0
SIDE_WALL_X   = 4096.0
CEILING_Z     = 2044.0
UU_PER_METER  = 100.0


def own_goal_y(team: int) -> float:
    """Coordenada Y de la portería propia y ÚNICA fuente de verdad del eje de campo:
    `advanced_stats` deriva de aquí el sentido de ataque (se ataca alejándose de la
    portería propia), así que corregir esta línea ajusta a la vez avg_dist_to_goal y
    time_offensive_half_pct. VERIFICAR la orientación con un replay real (el equipo
    defensor debe salir con menor distancia a su portería)."""
    return -GOAL_Y if team == 0 else GOAL_Y


def uu_to_m(value):
    """Convierte una distancia en UU a metros (1 decimal). None pasa como None."""
    return None if value is None else round(value / UU_PER_METER, 1)
