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
  replays:        (skip = 0, limit = 50) => fetchJSON(`${BASE}/replays?skip=${skip}&limit=${limit}`),
  replay:         (id)                   => fetchJSON(`${BASE}/replays/${id}`),
  profile:        ()                     => cached('profile',        () => fetchJSON(`${BASE}/profile`)),
  profileHistory: ()                     => cached('profileHistory', () => fetchJSON(`${BASE}/profile/history`)),
}
