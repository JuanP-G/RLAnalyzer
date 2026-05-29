const BASE = '/api'

async function fetchJSON(url) {
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
    throw Object.assign(new Error(err.detail || `HTTP ${res.status}`), { status: res.status })
  }
  return res.json()
}

// ── Caché en memoria (persiste mientras la app esté abierta) ──────────────────
const _cache = {}
const CACHE_TTL = 5 * 60 * 1000  // 5 min

function cached(key, fetcher) {
  const entry = _cache[key]
  if (entry && Date.now() - entry.ts < CACHE_TTL) {
    return Promise.resolve(entry.data)
  }
  return fetcher().then(data => {
    _cache[key] = { data, ts: Date.now() }
    return data
  })
}

export async function invalidateProfileCache() {
  delete _cache.profile
  delete _cache.profileHistory
  // Borra también la caché en disco del backend
  await fetch(`${BASE}/profile/invalidate`, { method: 'POST' }).catch(() => {})
}

// Construye el query string compartido por /stats/analysis y /stats/trend
function _statsQuery(f = {}) {
  const p = new URLSearchParams()
  if (f.team_size != null)     p.set('team_size', f.team_size)
  if (f.category)              p.set('category',  f.category)
  if (f.date_from)             p.set('date_from', f.date_from)
  if (f.date_to)               p.set('date_to',   f.date_to)
  if (f.bucket)                p.set('bucket',    f.bucket)
  if (f.exclude_abnormal === false) p.set('exclude_abnormal', 'false')
  if (f.min_duration != null)  p.set('min_duration',  f.min_duration)
  if (f.max_goal_diff != null) p.set('max_goal_diff', f.max_goal_diff)
  const qs = p.toString()
  return qs ? `?${qs}` : ''
}

export const api = {
  status:         ()                     => fetchJSON(`${BASE}/status`),
  summary:        ()                     => fetchJSON(`${BASE}/stats/summary`),
  myStats:        ()                     => fetchJSON(`${BASE}/stats/me`),
  analysisFilters:()                     => fetchJSON(`${BASE}/stats/analysis/filters`),
  glossary:       ()                     => fetchJSON(`${BASE}/stats/glossary`),
  analysis:       (filters = {})         => fetchJSON(`${BASE}/stats/analysis${_statsQuery(filters)}`),
  trend:          (filters = {})         => fetchJSON(`${BASE}/stats/trend${_statsQuery(filters)}`),
  dashboard:      (filters = {}) => {
    const p = new URLSearchParams()
    if (filters.team_size != null)        p.set('team_size', filters.team_size)
    if (filters.result)                   p.set('result',    filters.result)
    if (filters.date_from)                p.set('date_from', filters.date_from)
    if (filters.bucket)                   p.set('bucket',    filters.bucket)
    if (filters.exclude_abnormal === false) p.set('exclude_abnormal', 'false')
    if (filters.min_duration != null)     p.set('min_duration',  filters.min_duration)
    if (filters.max_goal_diff != null)    p.set('max_goal_diff', filters.max_goal_diff)
    const qs = p.toString()
    return fetchJSON(`${BASE}/stats/dashboard${qs ? `?${qs}` : ''}`)
  },
  replays:        (skip = 0, limit = 50, filters = {}) => {
    const p = new URLSearchParams({ skip, limit })
    if (filters.result)        p.set('result',        filters.result)
    if (filters.favorite)      p.set('favorite',      '1')
    if (filters.team_size)     p.set('team_size',     filters.team_size)
    if (filters.match_type)    p.set('match_type',    filters.match_type)
    if (filters.game_category) p.set('game_category', filters.game_category)
    return fetchJSON(`${BASE}/replays?${p}`)
  },
  replay:         (id)                   => fetchJSON(`${BASE}/replays/${id}`),
  replayFrames:   (id)                   => fetchJSON(`${BASE}/replays/${id}/frames`),
  ballchasing:    (id)                   => fetchJSON(`${BASE}/replays/${id}/ballchasing`),
  setFavorite:    (id, value)            => fetch(`${BASE}/replays/${id}/favorite`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ value }),
                  }).then(r => { if (!r.ok) throw new Error('Error al actualizar favorito'); return r.json() }),
  profile:        ()                     => cached('profile',        () => fetchJSON(`${BASE}/profile`)),
  profileHistory: ()                     => cached('profileHistory', () => fetchJSON(`${BASE}/profile/history`)),
  players:        (q = '')               => fetchJSON(`${BASE}/players${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  playerSummary:  (name)                 => fetchJSON(`${BASE}/players/${encodeURIComponent(name)}/summary`),
  playerReplays:  (name, ctx, skip = 0, limit = 30) => {
    const p = new URLSearchParams({ skip, limit })
    if (ctx) p.set('context', ctx)
    return fetchJSON(`${BASE}/players/${encodeURIComponent(name)}/replays?${p}`)
  },
}
