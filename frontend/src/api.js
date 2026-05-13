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

export const api = {
  status:         ()                     => fetchJSON(`${BASE}/status`),
  summary:        ()                     => fetchJSON(`${BASE}/stats/summary`),
  myStats:        ()                     => fetchJSON(`${BASE}/stats/me`),
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
  setFavorite:    (id, value)            => fetch(`${BASE}/replays/${id}/favorite`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ value }),
                  }).then(r => { if (!r.ok) throw new Error('Error al actualizar favorito'); return r.json() }),
  profile:        ()                     => cached('profile',        () => fetchJSON(`${BASE}/profile`)),
  profileHistory: ()                     => cached('profileHistory', () => fetchJSON(`${BASE}/profile/history`)),
}
