// Lógica pura para comparar dos partidas (A vs B) por rol: yo / mi equipo / equipo rival.
// Refleja _metric_value (backend/routers/stats.py:91) y _avg (stats.py:101) para que los
// números cuadren con /api/stats/analysis.

// Métricas que se agregan SUMANDO los jugadores de un equipo (recuentos / acumulados).
export const SUM_KEYS = new Set([
  'score', 'goals', 'assists', 'shots', 'saves',
  'boost_collected', 'boost_stolen', 'boost_wasted',
  'time_supersonic', 'time_slow', 'time_on_ground', 'time_low_air', 'time_high_air',
  'total_distance',
])

// Métricas que se agregan PROMEDIANDO (son ya medias por jugador).
export const MEAN_KEYS = new Set(['avg_boost', 'avg_speed'])

// 'shooting_pct' es derivada (goals/shots*100) y se trata aparte.
// 'demos_inflicted' y 'time_boost_speed' existen en el jugador pero no están en METRICS → se ignoran.

// Suelos por métrica para el resumen "qué hiciste distinto": diferencia absoluta mínima
// para considerar relevante una métrica cuyo % relativo podría exagerar el ruido.
const ABS_MIN = {
  goals: 1, assists: 1, saves: 1, shots: 1, score: 20, shooting_pct: 5,
  avg_boost: 3, boost_collected: 50, boost_stolen: 50, boost_wasted: 50,
  avg_speed: 2, time_supersonic: 5, time_slow: 5, time_on_ground: 5,
  time_low_air: 5, time_high_air: 5, total_distance: 1000,
}

// ── Resolución de equipos ───────────────────────────────────────────────────────
export function resolveTeams(replay) {
  const players = replay?.players || []
  const me = players.find(p => p.is_me) || null
  const myTeamId = replay?.my_team != null ? replay.my_team : (me ? me.team : 0)
  const myPlayers = players.filter(p => p.team === myTeamId)
  const rivalPlayers = players.filter(p => p.team !== myTeamId)
  return { me, myTeamId, myPlayers, rivalPlayers }
}

// ── Valor de una métrica para un jugador (mismo cálculo que el backend) ───────────
function playerMetric(p, key) {
  if (!p) return null
  if (key === 'shooting_pct') {
    const shots = p.shots || 0
    if (shots <= 0) return null
    return (p.goals || 0) / shots * 100
  }
  const v = p[key]
  return v == null ? null : v
}

// ── Valor agregado de un equipo ───────────────────────────────────────────────────
function teamMetric(players, key) {
  if (!players || players.length === 0) return null
  if (key === 'shooting_pct') {
    const goals = players.reduce((s, p) => s + (p.goals || 0), 0)
    const shots = players.reduce((s, p) => s + (p.shots || 0), 0)
    if (shots <= 0) return null
    return goals / shots * 100
  }
  const vals = players.map(p => p[key]).filter(v => v != null)
  if (vals.length === 0) return null
  const sum = vals.reduce((a, b) => a + b, 0)
  return MEAN_KEYS.has(key) ? sum / vals.length : sum
}

// ── API pública: valor de una métrica para un rol en una partida ──────────────────
// role: 'me' | 'myteam' | 'rival'
export function metricValue(replay, role, key) {
  const { me, myPlayers, rivalPlayers } = resolveTeams(replay)
  if (role === 'me') return playerMetric(me, key)
  if (role === 'myteam') return teamMetric(myPlayers, key)
  if (role === 'rival') return teamMetric(rivalPlayers, key)
  return null
}

// ── Delta + color ─────────────────────────────────────────────────────────────────
// Devuelve { delta, hasBoth, color: 'win' | 'loss' | 'neutral' }
export function deltaInfo(a, b, higherBetter) {
  if (a == null || b == null) return { delta: null, hasBoth: false, color: 'neutral' }
  const delta = a - b
  if (higherBetter == null || delta === 0) return { delta, hasBoth: true, color: 'neutral' }
  const better = higherBetter ? delta > 0 : delta < 0
  return { delta, hasBoth: true, color: better ? 'win' : 'loss' }
}

// ── Formato ─────────────────────────────────────────────────────────────────────
function round1(v) {
  return Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toFixed(1)
}

export function formatMetric(v, unit) {
  if (v == null) return '—'
  let s = Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('es-ES') : round1(v)
  if (unit === '%') s += '%'
  else if (unit === 's') s += 's'
  return s
}

export function formatDelta(delta, unit) {
  if (delta == null) return '—'
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : ''
  const abs = Math.abs(delta)
  let s = abs >= 1000 ? Math.round(abs).toLocaleString('es-ES') : round1(abs)
  s = `${sign}${s}`
  if (unit === '%') s += '%'
  else if (unit === 's') s += 's'
  return s
}

// ── Resumen "qué hiciste distinto" ────────────────────────────────────────────────
// Compara A vs B para un rol y devuelve las métricas con mayor diferencia relevante.
export function buildSummary(replayA, replayB, metrics, role = 'me') {
  const items = []
  for (const m of metrics) {
    const a = metricValue(replayA, role, m.key)
    const b = metricValue(replayB, role, m.key)
    if (a == null || b == null) continue
    const delta = a - b
    if (delta === 0) continue
    const base = Math.abs(b) > 1e-6 ? Math.abs(b) : Math.abs(a)
    const relPct = base > 1e-6 ? (delta / base) * 100 : 0
    const absMin = ABS_MIN[m.key] ?? 0.5
    if (Math.abs(relPct) < 8 && Math.abs(delta) < absMin) continue
    const better = m.higher_better == null ? null : (m.higher_better ? delta > 0 : delta < 0)
    items.push({ key: m.key, label: m.label, unit: m.unit, delta, relPct, better })
  }
  items.sort((x, y) => Math.abs(y.relPct) - Math.abs(x.relPct))
  return items.slice(0, 6)
}
