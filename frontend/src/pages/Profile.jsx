import { useEffect, useState, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { api, invalidateProfileCache } from '../api'

// ── Metadata de playlists ─────────────────────────────────────────────────────
const PLAYLIST_META = {
  10: { label: '1v1 — Duelo',        color: '#00A8FF' },
  11: { label: '2v2 — Dobles',       color: '#F4620F' },
  13: { label: '3v3 — Estándar',     color: '#3DDB85' },
  27: { label: 'Hoops',              color: '#FFB800' },
  28: { label: 'Rumble',             color: '#C084FC' },
  29: { label: 'Dropshot',           color: '#38BDF8' },
  30: { label: 'Snowday',            color: '#7DD3FC' },
  34: { label: '4v4 Quads',          color: '#A78BFA' },
   0: { label: 'Casual',             color: '#7B91B0' },
}

// ── Iconos de rango locales (por tier value 0–22) ────────────────────────────
const TIER_TO_FILE = {
   0: 'unranked',
   1: 'b1',  2: 'b2',  3: 'b3',
   4: 's1',  5: 's2',  6: 's3',
   7: 'g1',  8: 'g2',  9: 'g3',
  10: 'p1', 11: 'p2', 12: 'p3',
  13: 'd1', 14: 'd2', 15: 'd3',
  16: 'c1', 17: 'c2', 18: 'c3',
  19: 'gc1',20: 'gc2',21: 'gc3',
  22: 'ssl',
}

function localTierIcon(tierValue) {
  if (tierValue == null) return null
  const file = TIER_TO_FILE[tierValue]
  if (!file) return null
  return `/ranks/${file}.png`
}

// Stats de carrera a mostrar
const OVERVIEW_KEYS = [
  { key: 'wins',           label: 'Victorias',   color: '#3DDB85' },
  { key: 'goals',          label: 'Goles',        color: '#00A8FF' },
  { key: 'saves',          label: 'Salvadas',     color: '#4FC3F7' },
  { key: 'assists',        label: 'Asistencias',  color: '#C2D6F5' },
  { key: 'shots',          label: 'Tiros',        color: '#C2D6F5' },
  { key: 'mvps',           label: 'MVPs',         color: '#FFB800' },
  { key: 'goalShotRatio',  label: 'Precisión',    color: '#C2D6F5' },
  { key: 'winPercentage',  label: 'Win Rate',     color: '#C2D6F5' },
  { key: 'assists',        label: 'Asistencias',  color: '#C2D6F5' },
  { key: 'score',          label: 'Score total',  color: '#C2D6F5' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(isoStr) {
  if (!isoStr) return null
  const diff = (Date.now() - new Date(isoStr).getTime()) / 1000
  if (diff < 60)    return 'hace menos de 1 min'
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`
  return `hace ${Math.floor(diff / 86400)} días`
}

// ── RankIcon: local SVG con fallback a URL remota ─────────────────────────────
function RankIcon({ tierValue, tierIconUrl, tierName, size = 72 }) {
  const [useFallback, setUseFallback] = useState(false)
  const local = localTierIcon(tierValue)

  const src = (!useFallback && local) ? local : tierIconUrl

  if (!src) return (
    <div style={{ width: size, height: size, background: '#0D2240', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#2A4A68', fontSize: 20, fontWeight: 700 }}>?</span>
    </div>
  )

  return (
    <img
      src={src}
      alt={tierName || ''}
      width={size}
      height={size}
      style={{ objectFit: 'contain', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))' }}
      onError={() => {
        if (!useFallback && tierIconUrl) setUseFallback(true)
      }}
    />
  )
}

// ── ErrorBox ──────────────────────────────────────────────────────────────────
function ErrorBox({ error, onRetry }) {
  const is429 = error?.status === 429
  // 503 = agotadas todas las capas de fallback
  const isExhausted = error?.status === 503 || error?.status === 502
  return (
    <div className="rounded-xl p-6" style={{ background: '#071829', border: '1px solid #1A3A5C' }}>
      <p className="font-display font-bold text-loss text-sm uppercase tracking-wider mb-2">
        {is429 ? '⏱ Rate limit' : '⚠ Sin datos disponibles'}
      </p>
      <p className="text-gray-400 text-sm leading-relaxed mb-3">{error.message}</p>

      {/* Pasos intentados */}
      <div className="rounded-lg p-3 mb-4" style={{ background: '#04101E', border: '1px solid #122A4D' }}>
        <p className="text-gray-400 text-[11px] uppercase tracking-wider font-display mb-2">Capas de fallback intentadas</p>
        {[
          { label: '1. tracker.gg API',        desc: 'api.tracker.gg/v2/...', fail: true },
          { label: '2. Web scraping',           desc: 'rocketleague.tracker.network', fail: true },
          { label: '3. Caché en disco',         desc: 'data/profile_cache.json', fail: true },
        ].map(({ label, desc, fail }) => (
          <div key={label} className="flex items-center gap-2 py-1">
            <span style={{ color: fail ? '#FF4757' : '#3DDB85', fontSize: 11 }}>{fail ? '✗' : '✓'}</span>
            <span className="text-gray-300 text-xs font-display font-semibold">{label}</span>
            <span className="text-gray-500 text-[10px] font-mono">{desc}</span>
          </div>
        ))}
      </div>

      {/* Solución */}
      <div className="rounded-lg p-3" style={{ background: '#04101E', border: '1px solid #122A4D' }}>
        <p className="text-gray-400 text-[11px] uppercase tracking-wider font-display mb-2">Solución — API key de tracker.gg</p>
        <p className="text-gray-400 text-[10px] mb-1 font-mono"># Edita el archivo: backend/.env</p>
        <p className="text-rl-blue text-xs font-mono">TRACKER_API_KEY=<span className="text-win">tu-key-aquí</span></p>
        <p className="text-gray-400 text-[10px] mt-1 font-mono"># Consigue tu key en: tracker.gg/developers</p>
        <p className="text-gray-400 text-[10px] mt-1 font-mono"># Luego reinicia el backend</p>
      </div>

      <button onClick={onRetry}
        className="mt-4 px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white transition-colors"
        style={{ background: '#0D2240', border: '1px solid #1A3A5C' }}>
        ↻ Reintentar
      </button>
    </div>
  )
}

// ── DivisionDelta: MMR para subir (▲) / bajar (▼) de división, estilo RL Tracker ──
// Apilado en vertical, a la derecha del MMR. Sin "mmr" (se sobreentiende).
function DivisionDelta({ up, down }) {
  if (up == null && down == null) return null
  return (
    <div className="flex flex-col gap-0.5 items-end flex-shrink-0"
         title="MMR para subir / bajar de división">
      {up != null && (
        <div className="flex items-center gap-1 leading-none">
          <svg width="8" height="8" viewBox="0 0 8 8"><polygon points="4,0 8,8 0,8" fill="#3DDB85"/></svg>
          <span className="font-mono-num font-bold text-xs" style={{ color: '#3DDB85' }}>{Math.round(up)}</span>
        </div>
      )}
      {down != null && (
        <div className="flex items-center gap-1 leading-none">
          <svg width="8" height="8" viewBox="0 0 8 8"><polygon points="4,8 8,0 0,0" fill="#FF4757"/></svg>
          <span className="font-mono-num font-bold text-xs" style={{ color: '#FF4757' }}>{Math.round(down)}</span>
        </div>
      )}
    </div>
  )
}

// ── RankCard ─────────────────────────────────────────────────────────────────
function RankCard({ playlist, index }) {
  const meta    = PLAYLIST_META[playlist.playlistId] || { label: playlist.name, color: '#7B91B0' }
  const dDown   = playlist.divisionDown
  const dUp     = playlist.divisionUp
  const streak  = playlist.winStreak
  const streakStr   = streak == null ? null : streak > 0 ? `+${streak}` : streak < 0 ? `${streak}` : '0'
  const streakColor = streak > 0 ? '#3DDB85' : streak < 0 ? '#FF4757' : '#7B91B0'

  return (
    <div
      className="rounded-xl flex flex-col overflow-hidden"
      style={{
        background: '#071829',
        border: '1px solid #122A4D',
        borderTop: `2px solid ${meta.color}`,
        animationDelay: `${index * 0.06}s`,
      }}
    >
      {/* Cabecera playlist */}
      <div className="px-4 pt-3 pb-2" style={{ borderBottom: '1px solid #0D2240' }}>
        <p className="font-display font-semibold text-[11px] uppercase tracking-widest" style={{ color: meta.color }}>
          {meta.label}
        </p>
      </div>

      {/* Icono + rango */}
      <div className="flex items-center gap-4 px-4 py-4">
        <RankIcon
          tierValue={playlist.tierValue}
          tierIconUrl={playlist.tierIconUrl}
          tierName={playlist.tierName}
          size={72}
        />
        <div className="min-w-0 flex-1">
          <p className="text-gray-100 font-display font-bold text-lg leading-tight truncate">
            {playlist.tierName || 'Sin clasificar'}
          </p>
          {playlist.divisionName && (
            <p className="text-gray-400 text-xs mt-0.5">{playlist.divisionName}</p>
          )}
          {playlist.mmr != null && (
            <div className="flex items-end justify-between gap-2 mt-1.5">
              <p className="font-mono-num font-bold text-xl leading-none" style={{ color: meta.color }}>
                {Math.round(playlist.mmr)}{' '}
                <span className="text-xs font-sans font-normal text-gray-400">MMR</span>
              </p>
              <DivisionDelta up={dUp} down={dDown} />
            </div>
          )}
          {playlist.peak != null && (
            <p className="text-gray-500 text-[10px] mt-1 font-mono-num">
              Pico: {Math.round(playlist.peak)} MMR
            </p>
          )}
        </div>
      </div>

      {/* Stats inferiores */}
      {(() => {
        const pct = playlist.percentile
        // "Top X%": dorado siempre; con brillo extra cuando estás en un top destacado (≤ 10%)
        const topStrong = pct != null && pct <= 10
        const topStyle = pct == null
          ? { color: '#C2D6F5' }
          : { color: topStrong ? '#FFC93C' : '#E0A82E',
              textShadow: topStrong ? '0 0 8px rgba(255,184,0,0.6)' : 'none' }
        const rank = playlist.globalRank
        const cells = [
          { label: 'Partidas', value: playlist.matchesPlayed },
          { label: 'Rank',     value: rank != null ? `#${Math.round(rank).toLocaleString('es-ES')}` : null },
          { label: 'Top',      value: pct != null ? `${pct.toFixed(1)}%` : null, style: topStyle },
          { label: 'Racha',    value: streakStr, style: streakStr ? { color: streakColor } : undefined },
        ]
        return (
          <div className="grid grid-cols-4 px-3 py-2.5 mt-auto" style={{ borderTop: '1px solid #0D2240' }}>
            {cells.map(({ label, value, style }) => (
              <div key={label} className="text-center">
                <p className="text-gray-500 text-[9px] uppercase tracking-wider font-display font-semibold">{label}</p>
                <p className="font-mono-num text-sm font-bold mt-0.5" style={style || { color: '#C2D6F5' }}>
                  {value ?? '—'}
                </p>
              </div>
            ))}
          </div>
        )
      })()}
    </div>
  )
}

// ── MmrChart ──────────────────────────────────────────────────────────────────
function MmrChart({ history, playlists }) {
  const [activeIds, setActiveIds] = useState(null)

  const playlistIds = playlists
    .map(p => p.playlistId)
    .filter(id => (history[id] || history[String(id)])?.length > 0)

  if (playlistIds.length === 0) return null

  const dateMap = {}
  for (const id of playlistIds) {
    const pts = (history[id] || history[String(id)] || []).slice(-90)
    for (const pt of pts) {
      const date = (pt.collectDate || pt.date || '').slice(0, 10)
      if (!date) continue
      if (!dateMap[date]) dateMap[date] = { date }
      dateMap[date][`pl_${id}`] = Math.round(pt.rating ?? pt.value ?? 0)
    }
  }
  const chartData = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date))
  if (chartData.length < 2) return null

  const visibleIds = activeIds || playlistIds
  const fmtDate = d => { const [, m, day] = d.split('-'); return `${day}/${m}` }

  return (
    <div className="rounded-xl p-5" style={{ background: '#071829', border: '1px solid #122A4D' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-gray-300 text-xs uppercase tracking-widest">
          Evolución de MMR
        </h3>
        <div className="flex gap-1.5 flex-wrap justify-end">
          {playlistIds.map(id => {
            const m  = PLAYLIST_META[id]
            const on = visibleIds.includes(id)
            return (
              <button key={id}
                onClick={() => setActiveIds(prev => {
                  const cur = prev || playlistIds
                  return cur.length === 1 && cur[0] === id ? playlistIds
                    : on ? cur.filter(x => x !== id) : [...cur, id]
                })}
                className="px-2 py-0.5 rounded text-[10px] font-display font-semibold uppercase tracking-wide transition-all"
                style={{
                  background: on ? `${m?.color}22` : '#0D2240',
                  color:      on ? m?.color : '#5888B4',
                  border:     `1px solid ${on ? `${m?.color}55` : '#1A3A5C'}`,
                }}
              >
                {m?.label?.split(' — ')[0] || id}
              </button>
            )
          })}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid stroke="#0D2240" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtDate}
            tick={{ fill: '#5888B4', fontSize: 10 }} axisLine={false} tickLine={false}
            interval="preserveStartEnd" />
          <YAxis tick={{ fill: '#5888B4', fontSize: 10 }} axisLine={false} tickLine={false}
            domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{ background: '#071829', border: '1px solid #1A3A5C', borderRadius: '10px', fontSize: 11 }}
            labelStyle={{ color: '#94B4DC', marginBottom: 4 }}
            formatter={(v, name) => {
              const id = parseInt(name.replace('pl_', ''))
              return [`${v} MMR`, PLAYLIST_META[id]?.label || name]
            }}
          />
          {playlistIds.map(id => (
            <Line key={id} type="monotone" dataKey={`pl_${id}`}
              stroke={(PLAYLIST_META[id] || {}).color || '#7B91B0'}
              strokeWidth={visibleIds.includes(id) ? 2 : 0}
              dot={false} activeDot={{ r: 3, strokeWidth: 0 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── CareerStats sidebar ───────────────────────────────────────────────────────
function CareerStats({ overview }) {
  const entries = OVERVIEW_KEYS
    .filter(({ key }) => overview[key])
    // deduplicar (assists aparece 2 veces en la lista original)
    .filter((item, idx, arr) => arr.findIndex(x => x.key === item.key) === idx)

  if (entries.length === 0) return null

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#071829', border: '1px solid #122A4D' }}>
      {/* Header */}
      <div className="px-4 py-3" style={{ background: '#04101E', borderBottom: '1px solid #0D2240' }}>
        <h3 className="font-display font-semibold text-gray-300 text-xs uppercase tracking-widest">
          Carrera acumulada
        </h3>
      </div>
      {/* Rows */}
      <div className="divide-y" style={{ '--tw-divide-opacity': 1 }}>
        {entries.map(({ key, label, color }, i) => {
          const stat = overview[key]
          if (!stat) return null
          return (
            <div key={key} className="flex items-center justify-between px-4 py-2.5 hover:bg-bg-hover transition-colors"
                 style={{ borderBottom: i < entries.length - 1 ? '1px solid #071829' : 'none' }}>
              <span className="text-gray-300 text-xs font-display uppercase tracking-wide">
                {stat.label || label}
              </span>
              <span className="font-mono-num font-bold text-sm" style={{ color }}>
                {stat.displayValue ?? stat.value ?? '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Profile() {
  const [profile, setProfile] = useState(null)
  const [history, setHistory] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    setError(null)
    if (forceRefresh) await invalidateProfileCache()  // esperar a que el backend borre el disco
    try {
      const [p, h] = await Promise.all([
        api.profile(),
        api.profileHistory().catch(() => null),
      ])
      setProfile(p)
      setHistory(h)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 rounded-full border-2 border-t-rl-blue border-bg-tertiary animate-spin mx-auto mb-3" />
        <p className="text-gray-600 text-sm">Cargando perfil desde tracker.gg…</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <h1 className="font-display font-bold text-gray-100 uppercase tracking-wider text-xl mb-5">Mi Perfil</h1>
      <div className="max-w-lg"><ErrorBox error={error} onRetry={() => load(true)} /></div>
    </div>
  )

  if (!profile) return null

  const ov = profile.overview || {}
  const hasCareer = Object.keys(ov).length > 0

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="space-y-5">

        {/* ── Cabecera ─────────────────────────────────────────────────── */}
        <div className="rounded-xl p-5 flex items-center gap-5"
             style={{ background: '#071829', border: '1px solid #122A4D' }}>
          {profile.avatarUrl
            ? <img src={profile.avatarUrl} alt="" className="w-14 h-14 rounded-full flex-shrink-0"
                   style={{ boxShadow: '0 0 0 2px #00A8FF33' }} />
            : <div className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 font-display font-bold text-2xl"
                   style={{ background: '#0D2240', color: '#00A8FF' }}>
                {profile.username?.[0]?.toUpperCase() || 'P'}
              </div>
          }
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-white text-2xl tracking-wide truncate leading-none">
              {profile.username}
            </h1>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="text-[11px] px-2 py-0.5 rounded font-display font-semibold uppercase tracking-wider"
                    style={{ background: '#0D2240', color: '#00A8FF', border: '1px solid #1A3A5C' }}>
                {profile.platform || 'Epic'}
              </span>
              {profile.currentSeason && (
                <span className="text-gray-400 text-xs">Temporada {profile.currentSeason}</span>
              )}
              {profile._stale && (
                <span className="text-[10px] px-2 py-0.5 rounded font-display uppercase tracking-wider"
                      style={{ background: '#2A1500', color: '#FFB800', border: '1px solid #664400' }}>
                  ⚠ Caché — sin conexión a tracker.gg
                </span>
              )}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            {profile.lastUpdated && (
              <p className="text-gray-400 text-xs">Actualizado {timeAgo(profile.lastUpdated)}</p>
            )}
            <button onClick={() => load(true)}
              className="mt-2 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white transition-all"
              style={{ background: '#0D2240', border: '1px solid #1A3A5C' }}>
              ↻ Actualizar
            </button>
          </div>
        </div>

        {/* ── Layout principal: rangos (izq) + stats de carrera (der) ───── */}
        <div className="flex gap-5 items-start">

          {/* Columna izquierda — rangos */}
          <div className="flex-1 min-w-0 space-y-4">
            {profile.playlists?.length > 0 && (() => {
              const COMP  = [10, 11, 13, 34]
              const EXTRA = [27, 28, 29, 30]
              const comp  = profile.playlists.filter(p => COMP.includes(p.playlistId))
              const extra = profile.playlists.filter(p => EXTRA.includes(p.playlistId))
              const casual = profile.playlists.filter(p => !COMP.includes(p.playlistId) && !EXTRA.includes(p.playlistId))

              const SectionLabel = ({ children }) => (
                <h2 className="font-display font-semibold text-gray-400 text-[10px] uppercase tracking-widest mb-2.5 flex items-center gap-2">
                  <span className="flex-1 h-px" style={{ background: '#0D2240' }} />
                  {children}
                  <span className="flex-1 h-px" style={{ background: '#0D2240' }} />
                </h2>
              )

              return (
                <div className="space-y-5">
                  {/* ── Competitivo ── */}
                  {comp.length > 0 && (
                    <section>
                      <SectionLabel>Competitivo · T{profile.currentSeason}</SectionLabel>
                      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${comp.length}, 1fr)` }}>
                        {comp.map((pl, i) => <RankCard key={pl.playlistId} playlist={pl} index={i} />)}
                      </div>
                    </section>
                  )}

                  {/* ── Modos Extra ── */}
                  {extra.length > 0 && (
                    <section>
                      <SectionLabel>Modos Extra</SectionLabel>
                      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${extra.length}, 1fr)` }}>
                        {extra.map((pl, i) => <RankCard key={pl.playlistId} playlist={pl} index={comp.length + i} />)}
                      </div>
                    </section>
                  )}

                  {/* ── Casual ── */}
                  {casual.length > 0 && (
                    <section>
                      <SectionLabel>Casual</SectionLabel>
                      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(casual.length, 4)}, 1fr)` }}>
                        {casual.map((pl, i) => <RankCard key={pl.playlistId} playlist={pl} index={comp.length + extra.length + i} />)}
                      </div>
                    </section>
                  )}
                </div>
              )
            })()}

            {/* Gráfica MMR debajo de los rangos */}
            {history && profile.playlists?.length > 0 && (
              <MmrChart history={history} playlists={profile.playlists} />
            )}

            {/* Pie — alineado con la columna de rangos */}
            <p className="text-gray-500 text-xs text-center pb-1">
              Datos de{' '}
              <a href={`https://rocketleague.tracker.network/rocket-league/profile/epic/${profile.username}/overview`}
                 target="_blank" rel="noopener noreferrer"
                 className="text-gray-400 hover:text-gray-300 transition-colors underline underline-offset-2">
                tracker.gg
              </a>
              {' '}· Caché de 10 minutos
            </p>
          </div>

          {/* Columna derecha — stats de carrera */}
          {hasCareer && (
            <div className="flex-shrink-0 w-64">
              <h2 className="font-display font-semibold text-gray-300 text-xs uppercase tracking-widest mb-3">
                Estadísticas
              </h2>
              <CareerStats overview={ov} />
            </div>
          )}

        </div>

      </div>
    </div>
  )
}
