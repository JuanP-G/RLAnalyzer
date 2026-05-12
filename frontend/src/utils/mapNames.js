/**
 * mapNames.js — RLAnalyzer
 * Convierte nombres internos de mapas de Rocket League a sus nombres oficiales.
 * Fuente: Ballchasing.com / CantFly + nombres alternativos de replays antiguos.
 * Los modificadores de variante están en español (Día, Noche, Tormentoso, etc.)
 */

const MAP_NAMES = {
  // ── DFH Stadium ────────────────────────────────────────────────
  'stadium_p':               'DFH Stadium',
  'stadium_day_p':           'DFH Stadium (Día)',
  'stadium_foggy_p':         'DFH Stadium (Tormentoso)',
  'stadium_winter_p':        'DFH Stadium (Nevada)',
  'stadium_10a_p':           'DFH Stadium',        // variante antigua

  // ── Mannfield ──────────────────────────────────────────────────
  'eurostadium_p':           'Mannfield',
  'eurostadium_night_p':     'Mannfield (Noche)',
  'eurostadium_rainy_p':     'Mannfield (Tormentoso)',
  'eurostadium_snownight_p': 'Mannfield (Nevada)',

  // ── Beckwith Park ──────────────────────────────────────────────
  'park_p':                  'Beckwith Park',
  'park_night_p':            'Beckwith Park (Medianoche)',
  'park_rainy_p':            'Beckwith Park (Tormentoso)',
  'park_snowy_p':            'Beckwith Park (Nevada)',

  // ── Urban Central ──────────────────────────────────────────────
  'trainstation_p':          'Urban Central',
  'trainstation_night_p':    'Urban Central (Noche)',
  'trainstation_dawn_p':     'Urban Central (Amanecer)',
  'haunted_trainstation_p':  'Urban Central (Halloween)',

  // ── Utopia Coliseum ────────────────────────────────────────────
  'utopiastadium_p':         'Utopia Coliseum',
  'utopiastadium_dusk_p':    'Utopia Coliseum (Atardecer)',
  'utopiastadium_snow_p':    'Utopia Coliseum (Nevada)',
  'labs_utopia_p':           'Utopia Retro',
  // Nombres alternativos (replays antiguos)
  'uf_p':                    'Utopia Coliseum',
  'uf_day_p':                'Utopia Coliseum (Día)',
  'uf_dusk_p':               'Utopia Coliseum (Atardecer)',
  'utopiaretro_p':           'Utopia Retro',

  // ── Champions Field (antes "Cyber Speedway") ───────────────────
  'cs_p':                    'Champions Field',
  'cs_day_p':                'Champions Field (Día)',
  'cs_hw_p':                 'Rivals Arena',       // Halloween → renombrado Rivals Arena
  'cs_hw':                   'Rivals Arena',       // sin el _p en algunos replays

  // ── Wasteland ──────────────────────────────────────────────────
  'wasteland_p':             'Wasteland',
  'wasteland_s_p':           'Wasteland (Estándar)',
  'wasteland_night_p':       'Wasteland (Noche)',
  'wasteland_night_s_p':     'Wasteland (Estándar, Noche)',

  // ── Neo Tokyo ──────────────────────────────────────────────────
  'neotokyo_p':              'Neo Tokyo',
  'neotokyo_standard_p':     'Neo Tokyo (Estándar)',
  'street_p':                'Neo Tokyo',          // nombre interno antiguo
  'street_day_p':            'Neo Tokyo (Día)',

  // ── Aquadome ───────────────────────────────────────────────────
  'underwater_p':            'Aquadome',
  'underwater_grs_p':        'Aquadome',

  // ── Starbase ARC ───────────────────────────────────────────────
  'arc_p':                   'Starbase ARC',
  'arc_standard_p':          'Starbase ARC (Estándar)',

  // ── Forbidden Temple ───────────────────────────────────────────
  'chn_stadium_p':           'Forbidden Temple',
  'chn_stadium_day_p':       'Forbidden Temple (Día)',
  'chn_stadium_night_p':     'Forbidden Temple (Noche)',

  // ── Salty Shores ───────────────────────────────────────────────
  'beach_p':                 'Salty Shores',
  'beach_night_p':           'Salty Shores (Noche)',
  'beachvolley':             'Salty Shores (Volley)',

  // ── Farmstead ──────────────────────────────────────────────────
  'farm_p':                  'Farmstead',
  'farm_night_p':            'Farmstead (Noche)',
  'farm_upsidedown_p':       'Farmstead (The Upside Down)',
  // Nombres alternativos (replays con prefijo "FF")
  'ff_p':                    'Farmstead',
  'ff_dusk_p':               'Farmstead (Atardecer)',
  'ff_mud_p':                'Farmstead (The Upside Down)',

  // ── París ──────────────────────────────────────────────────────
  // "Paname" es el argot francés para París
  'paname_p':                'Paris',
  'paname_dusk_p':           'Paris (Atardecer)',

  // ── Rivals Arena ───────────────────────────────────────────────
  'mall_p':                  'Rivals Arena',
  'mall_day_p':              'Rivals Arena (Día)',

  // ── Throwback Stadium ──────────────────────────────────────────
  'throwbackstadium_p':      'Throwback Stadium',
  'throwback_p':             'Throwback Stadium',

  // ── Dunk House (Hoops) ─────────────────────────────────────────
  'hoopsstadium_p':          'Dunk House',
  'hoops_dunkhouse':         'Dunk House',
  'hoops_dunkhouse_p':       'Dunk House',

  // ── Core 707 (Dropshot) ────────────────────────────────────────
  'shattershot_p':           'Core 707',

  // ── Neon Fields ────────────────────────────────────────────────
  'music_p':                 'Neon Fields',

  // ── Rocket Labs ────────────────────────────────────────────────
  'labs_circlepillars_p':    'Rocket Labs - Pillars',
  'labs_cosmic_p':           'Rocket Labs - Cosmic',
  'labs_cosmic_v4_p':        'Rocket Labs - Cosmic',
  'labs_doublegoal_p':       'Rocket Labs - Double Goal',
  'labs_doublegoal_v2_p':    'Rocket Labs - Double Goal',
  'labs_octagon_02_p':       'Rocket Labs - Octagon',
  'labs_octagon_p':          'Rocket Labs - Octagon',
  'labs_underpass_p':        'Rocket Labs - Underpass',
  'labs_underpass_v0_p':     'Rocket Labs - Underpass',

  // ── Snow Day ───────────────────────────────────────────────────
  'snowday_p':               'Arctagon (Snow Day)',
}

/**
 * Devuelve el nombre oficial del mapa dado su nombre interno.
 * La comparación es case-insensitive.
 * Si no se encuentra en el mapeo, formatea el nombre interno
 * quitando el sufijo "_p" y reemplazando "_" por espacios.
 */
export function getMapName(internalName) {
  if (!internalName) return '—'
  const key = internalName.toLowerCase()
  if (MAP_NAMES[key]) return MAP_NAMES[key]

  // Fallback: limpiar el nombre interno
  return internalName
    .replace(/_p$/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}
