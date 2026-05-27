import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getMapName } from '../utils/mapNames'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI

const SPEED_MAX        = 83
const SPEED_SUPERSONIC = 79
const SPEED_BOOST      = 51
const SPEED_SLOW       = 26

function pct(v) { return Math.min(100, Math.max(0, (v / SPEED_MAX) * 100)) }

function diffLabel(current, avg) {
  if (current == null || avg == null || avg === 0) return null
  const diff = current - avg
  const p    = (diff / avg) * 100
  const sign = diff >= 0 ? '+' : ''
  return { diff, pct: p, label: `${sign}${diff.toFixed(1)} (${sign}${p.toFixed(0)}%)`,
    positive: diff > 0, neutral: Math.abs(p) < 3 }
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
function formatDuration(secs) {
  if (!secs) return '—'
  const m = Math.floor(secs / 60), s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function StatCell({ value, isMe }) {
  if (value == null) return <td className="px-3 py-2 text-gray-600 text-center">—</td>
  const display = typeof value === 'number'
    ? (Number.isInteger(value) ? value : value.toFixed(1)) : value
  return (
    <td className={`px-3 py-2 text-center font-mono-num transition-colors ${
      isMe ? 'text-rl-blue font-semibold' : 'text-gray-300'}`}>
      {display}
    </td>
  )
}

function InfoBadge({ label, value }) {
  if (!value) return null
  return (
    <div className="bg-bg-tertiary rounded-lg px-4 py-2 flex flex-col items-center">
      <p className="text-gray-500 text-xs">{label}</p>
      <p className="text-gray-100 font-medium text-sm mt-0.5">{value}</p>
    </div>
  )
}

// ── Barra de velocidad: solo 2 marcadores visibles ────────────────────────────
function SpeedBar({ mySpeed, avgAll }) {
  const zones = [
    { from: 0,              to: SPEED_SLOW,       label: 'Lento',       range: `0–${SPEED_SLOW} km/h`,              bg: '#374151' },
    { from: SPEED_SLOW,     to: SPEED_BOOST,      label: 'Sin boost',   range: `${SPEED_SLOW}–${SPEED_BOOST} km/h`, bg: '#065f46' },
    { from: SPEED_BOOST,    to: SPEED_SUPERSONIC, label: 'Boost',       range: `${SPEED_BOOST}–${SPEED_SUPERSONIC} km/h`, bg: '#c2410c' },
    { from: SPEED_SUPERSONIC, to: SPEED_MAX,      label: 'Supersónico', range: `${SPEED_SUPERSONIC}–${SPEED_MAX} km/h`, bg: '#0369a1' },
  ]

  // Marcador 0 → etiqueta ARRIBA de la barra, Marcador 1 → etiqueta ABAJO
  const markers = [
    mySpeed != null && { v: mySpeed, label: 'Esta partida', color: '#38bdf8', glow: '0 0 8px #38bdf888', above: true },
    avgAll  != null && { v: avgAll,  label: 'Tu media',     color: '#c084fc', glow: '0 0 8px #c084fc88', above: false },
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-1">
      {/* Etiquetas ARRIBA (marcadores con above=true) */}
      <div className="relative h-8">
        {markers.filter(m => m.above).map((m, i) => (
          <div
            key={i}
            className="absolute flex flex-col items-end animate-fade-in"
            style={{ left: `${pct(m.v)}%`, transform: 'translateX(-50%)', bottom: 0, animationDelay: '0.2s' }}
          >
            <div
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap mb-0.5"
              style={{ backgroundColor: `${m.color}22`, color: m.color, border: `1px solid ${m.color}55` }}
            >
              {m.label}: {m.v.toFixed(1)} km/h
            </div>
            {/* Triángulo apuntando hacia abajo */}
            <div style={{
              width: 0, height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: `6px solid ${m.color}`,
              alignSelf: 'center',
            }} />
          </div>
        ))}
      </div>

      {/* Barra */}
      <div className="relative h-10 rounded-lg overflow-hidden flex">
        {zones.map(z => (
          <div
            key={z.label}
            className="flex flex-col items-center justify-center"
            style={{ width: `${pct(z.to) - pct(z.from)}%`, backgroundColor: z.bg }}
          >
            <span className="text-white text-[11px] font-bold leading-none select-none">{z.label}</span>
            <span className="text-white/60 text-[9px] leading-none mt-0.5 select-none">{z.range}</span>
          </div>
        ))}

        {/* Líneas de marcador */}
        {markers.map((m, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-[3px] animate-marker"
            style={{
              left: `${pct(m.v)}%`,
              transform: 'translateX(-50%)',
              backgroundColor: m.color,
              boxShadow: m.glow,
              animationDelay: `${i * 0.1}s`,
              zIndex: 10,
            }}
          />
        ))}
      </div>

      {/* Etiquetas ABAJO (marcadores con above=false) */}
      <div className="relative h-8">
        {markers.filter(m => !m.above).map((m, i) => (
          <div
            key={i}
            className="absolute flex flex-col items-center animate-fade-in"
            style={{ left: `${pct(m.v)}%`, transform: 'translateX(-50%)', top: 0, animationDelay: '0.3s' }}
          >
            {/* Triángulo apuntando hacia arriba */}
            <div style={{
              width: 0, height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderBottom: `6px solid ${m.color}`,
            }} />
            <div
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap mt-0.5"
              style={{ backgroundColor: `${m.color}22`, color: m.color, border: `1px solid ${m.color}55` }}
            >
              {m.label}: {m.v.toFixed(1)} km/h
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Panel colapsable de velocidades ───────────────────────────────────────────
function SpeedInfoPanel({ mySpeed, myStats }) {
  const [open, setOpen] = useState(false)
  const avgAll = myStats?.overall?.avg_speed

  return (
    <div className="bg-bg-secondary border border-bg-tertiary rounded-xl overflow-hidden transition-all duration-200">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3 flex items-center justify-between text-sm text-gray-300 hover:bg-bg-tertiary/40 transition-colors duration-150"
      >
        <div className="flex items-center gap-2">
          <span className="text-rl-blue">⚡</span>
          <span className="font-medium">Referencia de velocidades</span>
          {mySpeed != null && (
            <span className="text-xs text-gray-500 ml-1">
              — tu media esta partida:&nbsp;
              <span className="text-gray-200 font-medium">{mySpeed.toFixed(1)} km/h</span>
            </span>
          )}
        </div>
        <span className={`text-gray-500 text-xs transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {open && (
        <div className="border-t border-bg-tertiary px-4 pb-5 pt-4 space-y-4 animate-panel">
          {/* Tarjetas de zonas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { bg: 'bg-gray-700',    bar: 'bg-gray-600',    name: 'Lento',       range: `0–${SPEED_SLOW} km/h`,              desc: 'Sin acción, girando o parado' },
              { bg: 'bg-emerald-950', bar: 'bg-emerald-700', name: 'Sin boost',   range: `${SPEED_SLOW}–${SPEED_BOOST} km/h`, desc: 'Acelerando sin boost activo' },
              { bg: 'bg-orange-950',  bar: 'bg-orange-600',  name: 'Boost',       range: `${SPEED_BOOST}–${SPEED_SUPERSONIC} km/h`, desc: 'Boost activo, velocidad alta' },
              { bg: 'bg-sky-950',     bar: 'bg-sky-600',     name: 'Supersónico', range: `${SPEED_SUPERSONIC}–${SPEED_MAX} km/h`,   desc: 'Máxima velocidad, el juego lo indica' },
            ].map((z, i) => (
              <div
                key={z.name}
                className={`${z.bg} rounded-lg p-3 border border-white/5 animate-fade-up`}
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <div className={`w-full h-1 rounded-full ${z.bar} mb-2`} />
                <p className="text-gray-100 text-xs font-semibold">{z.name}</p>
                <p className="text-sky-400 text-[11px] mt-0.5 font-medium">{z.range}</p>
                <p className="text-gray-500 text-[11px] mt-1 leading-tight">{z.desc}</p>
              </div>
            ))}
          </div>

          {/* Barra */}
          <SpeedBar mySpeed={mySpeed} avgAll={avgAll} />
        </div>
      )}
    </div>
  )
}

// ── Comparativa vs media histórica ────────────────────────────────────────────
function StatsComparison({ me, myStats }) {
  if (!me || !myStats?.overall) return null

  const STATS = [
    { key: 'score',           label: 'Score',             fmtFn: v => Math.round(v) },
    { key: 'goals',           label: 'Goles',             fmtFn: v => v.toFixed(1) },
    { key: 'assists',         label: 'Asistencias',       fmtFn: v => v.toFixed(1) },
    { key: 'saves',           label: 'Saves',             fmtFn: v => v.toFixed(1) },
    { key: 'shots',           label: 'Tiros',             fmtFn: v => v.toFixed(1) },
    { key: 'boost_collected', label: 'Boost recolectado', fmtFn: v => Math.round(v) },
    { key: 'avg_speed',       label: 'Velocidad media',   fmtFn: v => `${v.toFixed(1)} km/h` },
    { key: 'time_supersonic', label: 'T. supersónico',    fmtFn: v => `${v.toFixed(1)}s` },
  ]

  return (
    <div className="bg-bg-secondary border border-bg-tertiary rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-bg-tertiary">
        <h3 className="text-sm font-medium text-gray-200">Tu rendimiento vs tu media histórica</h3>
        <p className="text-xs text-gray-500 mt-0.5">Sobre {myStats.overall.count} partidas registradas</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-bg-tertiary">
              <th className="px-4 py-2 text-left">Estadística</th>
              <th className="px-4 py-2 text-center">Esta partida</th>
              <th className="px-4 py-2 text-center">Tu media</th>
              <th className="px-4 py-2 text-center text-emerald-600">Media victorias</th>
              <th className="px-4 py-2 text-center text-red-700">Media derrotas</th>
              <th className="px-4 py-2 text-center">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {STATS.map(({ key, label, fmtFn }, i) => {
              const current = me[key]
              const avg     = myStats.overall?.[key]
              const avgW    = myStats.wins?.[key]
              const avgL    = myStats.losses?.[key]
              const d       = diffLabel(current, avg)
              return (
                <tr
                  key={key}
                  className="border-b border-bg-tertiary/40 hover:bg-bg-tertiary/25 transition-colors duration-100 animate-fade-up"
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{label}</td>
                  <td className="px-4 py-2.5 text-center font-mono-num text-gray-100 font-semibold">
                    {current != null ? fmtFn(current) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono-num text-gray-400 text-xs">
                    {avg != null ? fmtFn(avg) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono-num text-emerald-500 text-xs">
                    {avgW != null ? fmtFn(avgW) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono-num text-red-400 text-xs">
                    {avgL != null ? fmtFn(avgL) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs font-mono-num">
                    {d == null ? (
                      <span className="text-gray-600">—</span>
                    ) : d.neutral ? (
                      <span className="text-gray-400">{d.label}</span>
                    ) : d.positive ? (
                      <span className="text-emerald-400 font-medium">▲ {d.label}</span>
                    ) : (
                      <span className="text-red-400 font-medium">▼ {d.label}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Botón de acción sobre el archivo ─────────────────────────────────────────
function ReplayFileButton({ icon, label, onClick, disabled, title }) {
  const [loading, setLoading] = useState(false)
  const handle = async () => {
    if (disabled || loading) return
    setLoading(true)
    try { await onClick() } finally { setLoading(false) }
  }
  return (
    <button
      onClick={handle}
      disabled={disabled || loading}
      title={disabled ? 'Archivo no disponible en este equipo' : title}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
      style={{
        background: disabled ? '#071829' : '#0D2240',
        border:     `1px solid ${disabled ? '#0D2240' : '#1A3A5C'}`,
        color:      disabled ? '#2A4A68' : '#90B8D8',
        cursor:     disabled ? 'not-allowed' : 'pointer',
        opacity:    disabled ? 0.5 : 1,
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = '#142F52' }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.background = '#0D2240' }}
    >
      <span>{loading ? '…' : icon}</span>
      {label}
    </button>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ReplayDetail() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const [replay,  setReplay]  = useState(null)
  const [myStats, setMyStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    Promise.all([api.replay(id), api.myStats()])
      .then(([r, s]) => { setReplay(r); setMyStats(s) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="text-center py-20 text-gray-500">Cargando...</div>
  if (error)   return (
    <div className="bg-loss/10 border border-loss/30 rounded-xl p-6 text-loss">Error: {error}</div>
  )
  if (!replay) return null

  const team0  = replay.players?.filter(p => p.team === 0) || []
  const team1  = replay.players?.filter(p => p.team === 1) || []
  const meData = replay.players?.find(p => p.is_me)

  const RESULT_CFG = {
    win:     { label: 'VICTORIA', color: '#3DDB85', glow: 'rgba(61,219,133,0.18)',  border: 'rgba(61,219,133,0.25)'  },
    loss:    { label: 'DERROTA',  color: '#FF4757', glow: 'rgba(255,71,87,0.18)',   border: 'rgba(255,71,87,0.25)'   },
    draw:    { label: 'EMPATE',   color: '#7B91B0', glow: 'transparent',            border: 'rgba(123,145,176,0.25)' },
    unknown: { label: '?',        color: '#436D96', glow: 'transparent',            border: 'rgba(67,109,150,0.2)'   },
  }
  const resCfg = RESULT_CFG[replay.result] || RESULT_CFG.unknown

  const TEAMS = [
    { label: 'Equipo Azul',    players: team0, teamId: 0, color: '#00A8FF', score: replay.team0_score },
    { label: 'Equipo Naranja', players: team1, teamId: 1, color: '#F4620F', score: replay.team1_score },
  ]

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
    <div className="space-y-5">

      {/* Header */}
      <div className="animate-fade-up">
        <button
          onClick={() => navigate(-1)}
          className="text-rl-blue text-sm hover:underline transition-opacity hover:opacity-80"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          ← Volver a partidas
        </button>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-gray-100 capitalize" style={{ fontSize: '1.6rem', letterSpacing: '0.03em' }}>
              {getMapName(replay.map_name)}
            </h1>
            <p className="text-gray-500 text-sm mt-1 capitalize">{formatDate(replay.played_at)}</p>

            {/* Botones de acción */}
            <div className="flex gap-2 mt-3 flex-wrap">
              {/* Ver en 3D — siempre visible si hay file_path */}
              <button
                onClick={() => navigate(`/viewer/${id}`)}
                disabled={!replay.file_path}
                title={replay.file_path ? 'Abrir visor 3D' : 'Archivo no disponible en este equipo'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
                style={{
                  background: replay.file_path ? 'linear-gradient(135deg,#00A8FF22,#0070CC22)' : '#071829',
                  border:     `1px solid ${replay.file_path ? '#00A8FF55' : '#0D2240'}`,
                  color:      replay.file_path ? '#00A8FF' : '#2A4A68',
                  cursor:     replay.file_path ? 'pointer' : 'not-allowed',
                }}
                onMouseEnter={e => { if (replay.file_path) e.currentTarget.style.background = 'linear-gradient(135deg,#00A8FF33,#0070CC33)' }}
                onMouseLeave={e => { if (replay.file_path) e.currentTarget.style.background = 'linear-gradient(135deg,#00A8FF22,#0070CC22)' }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <path d="M6.5 1.5L11.5 6.5L6.5 11.5"/>
                  <circle cx="6" cy="6.5" r="4.5"/>
                  <circle cx="6" cy="6.5" r="1.5" fill="currentColor" stroke="none"/>
                </svg>
                Ver en 3D
              </button>

              {/* Botones de archivo — solo en Electron */}
              {isElectron && (
                <>
                  <ReplayFileButton
                    icon="📁"
                    label="Abrir ubicación"
                    title="Abrir la carpeta del archivo en el Explorador"
                    onClick={async () => {
                      const r = await window.electronAPI.showReplayInFolder(replay.file_path)
                      if (!r.ok) alert(r.error || 'No se pudo abrir la ubicación')
                    }}
                    disabled={!replay.file_path}
                  />
                  <ReplayFileButton
                    icon="💾"
                    label="Exportar"
                    title="Copiar el archivo .replay a otra carpeta"
                    onClick={async () => {
                      const r = await window.electronAPI.exportReplay(replay.file_path)
                      if (!r.ok && !r.canceled) alert(r.error || 'No se pudo exportar')
                    }}
                    disabled={!replay.file_path}
                  />
                </>
              )}
            </div>
          </div>

          {/* Banner resultado estilo RL */}
          <div
            className="font-display font-bold text-2xl tracking-widest uppercase px-6 py-2 rounded-lg flex-shrink-0"
            style={{
              color: resCfg.color,
              background: `${resCfg.glow}`,
              border: `1px solid ${resCfg.border}`,
              boxShadow: `0 0 24px ${resCfg.glow}`,
            }}
          >
            {resCfg.label}
          </div>
        </div>
      </div>

      {/* Info badges */}
      <div className="flex flex-wrap gap-3 animate-fade-up" style={{ animationDelay: '0.05s' }}>
        <InfoBadge label="Modo"     value={replay.match_type} />
        <InfoBadge label="Formato"  value={replay.team_size ? `${replay.team_size}v${replay.team_size}` : null} />
        <InfoBadge label="Duración" value={formatDuration(replay.duration_secs)} />
      </div>

      {/* Tablas por equipo */}
      {TEAMS.map(({ label, players, teamId, color, score }, ti) => (
        players.length > 0 && (
          <section
            key={teamId}
            className="animate-fade-up"
            style={{ animationDelay: `${0.1 + ti * 0.07}s` }}
          >
            {/* Header de equipo estilo RL — barra de color + nombre */}
            <div className="flex items-center gap-3 mb-2.5">
              <div
                className="h-5 w-[3px] rounded-full flex-shrink-0"
                style={{ background: color, boxShadow: `0 0 8px ${color}99` }}
              />
              <span
                className="font-display font-semibold text-sm uppercase tracking-widest"
                style={{ color }}
              >
                {label}
              </span>
              {score != null && (
                <span
                  className="text-2xl font-black tabular-nums leading-none ml-1"
                  style={{
                    color: replay.my_team === teamId
                      ? (replay.result === 'win' ? '#3DDB85' : replay.result === 'loss' ? '#FF4757' : '#7B91B0')
                      : '#284F74',
                  }}
                >
                  {score}
                </span>
              )}
              {replay.my_team === teamId && (
                <span className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#436D96' }}>
                  mi equipo
                </span>
              )}
            </div>

            <div
              className="bg-bg-secondary rounded-xl overflow-x-auto"
              style={{ border: `1px solid #122A4D`, borderTopColor: `${color}55`, borderTopWidth: '2px' }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider font-display font-semibold" style={{ background: '#071829', borderBottom: '1px solid #122A4D', color: '#436D96' }}>
                    <th className="px-3 py-3 text-left">Jugador</th>
                    <th className="px-3 py-3 text-center">Score</th>
                    <th className="px-3 py-3 text-center">Goles</th>
                    <th className="px-3 py-3 text-center">Asist.</th>
                    <th className="px-3 py-3 text-center">Saves</th>
                    <th className="px-3 py-3 text-center">Tiros</th>
                    <th className="px-3 py-3 text-center">Boost rec.</th>
                    <th className="px-3 py-3 text-center">Vel. media</th>
                    <th className="px-3 py-3 text-center">T. supersónico</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, i) => (
                    <tr
                      key={p.id}
                      className={`border-b border-bg-tertiary/50 transition-colors duration-100 hover:bg-bg-tertiary/30
                        ${p.is_me ? 'bg-rl-blue/5' : ''}
                        ${i === players.length - 1 ? 'border-b-0' : ''}`}
                    >
                      <td className="px-3 py-3">
                        {p.is_me ? (
                          <span className="font-medium text-rl-blue">
                            {p.player_name}
                            <span className="ml-2 text-xs bg-rl-blue/20 text-rl-blue px-1.5 py-0.5 rounded">tú</span>
                          </span>
                        ) : (
                          <Link
                            to={`/players/${encodeURIComponent(p.player_name)}`}
                            className="font-medium text-gray-200 hover:text-rl-blue transition-colors"
                            title={`Ver historial con ${p.player_name}`}
                          >
                            {p.player_name}
                          </Link>
                        )}
                      </td>
                      <StatCell value={p.score}           isMe={p.is_me} />
                      <StatCell value={p.goals}           isMe={p.is_me} />
                      <StatCell value={p.assists}         isMe={p.is_me} />
                      <StatCell value={p.saves}           isMe={p.is_me} />
                      <StatCell value={p.shots}           isMe={p.is_me} />
                      <StatCell value={p.boost_collected} isMe={p.is_me} />
                      <StatCell value={p.avg_speed != null ? `${Math.round(p.avg_speed)} km/h` : null} isMe={p.is_me} />
                      <StatCell value={p.time_supersonic != null ? `${p.time_supersonic.toFixed(1)}s` : null} isMe={p.is_me} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      ))}

      {(!replay.players || replay.players.length === 0) && (
        <div className="text-center py-10 text-gray-500 text-sm animate-fade-in">
          No hay datos de jugadores para este replay.
        </div>
      )}

      {/* Info extra debajo */}
      <div className="animate-fade-up" style={{ animationDelay: '0.25s' }}>
        <SpeedInfoPanel mySpeed={meData?.avg_speed} myStats={myStats} />
      </div>
      <div className="animate-fade-up" style={{ animationDelay: '0.3s' }}>
        <StatsComparison me={meData} myStats={myStats} />
      </div>
    </div>
    </div>
  )
}
