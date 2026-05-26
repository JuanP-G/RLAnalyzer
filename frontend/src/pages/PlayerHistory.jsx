import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getMapName } from '../utils/mapNames'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function WinRateRing({ rate, size = 72 }) {
  const r   = (size / 2) - 6
  const circ = 2 * Math.PI * r
  const dash = (rate / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1A3A5C" strokeWidth={6} />
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke={rate >= 50 ? '#3DDB85' : '#FF4757'} strokeWidth={6}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
      />
    </svg>
  )
}

function RecordCard({ title, color, accent, data }) {
  if (!data) return (
    <div className="rounded-xl p-5 flex-1" style={{ background: '#071829', border: `1px solid ${color}22` }}>
      <p className="font-display font-bold text-xs uppercase tracking-wider mb-3" style={{ color }}>{title}</p>
      <p className="text-gray-500 text-sm">Sin partidas registradas</p>
    </div>
  )
  const { games, wins, losses, win_rate, my_avg, their_avg } = data
  return (
    <div className="rounded-xl p-5 flex-1" style={{ background: '#071829', border: `1px solid ${color}33` }}>
      <p className="font-display font-bold text-xs uppercase tracking-wider mb-4" style={{ color }}>{title}</p>

      <div className="flex items-center gap-4 mb-5">
        <div className="relative" style={{ width: 72, height: 72 }}>
          <WinRateRing rate={win_rate} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-display font-bold text-sm" style={{ color: win_rate >= 50 ? '#3DDB85' : '#FF4757' }}>
              {win_rate}%
            </span>
          </div>
        </div>
        <div>
          <p className="text-gray-100 font-display font-bold text-2xl">{games} <span className="text-gray-500 text-sm font-normal">partidas</span></p>
          <p className="text-sm mt-0.5">
            <span className="text-win font-semibold">{wins}V</span>
            <span className="text-gray-500 mx-1">·</span>
            <span className="text-loss font-semibold">{losses}D</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {[
          ['Goles (yo)',    my_avg?.goals,    their_avg?.goals,    'Goles (él)'],
          ['Asist. (yo)',   my_avg?.assists,  their_avg?.assists,  'Asist. (él)'],
          ['Paradas (yo)',  my_avg?.saves,    their_avg?.saves,    'Paradas (él)'],
          ['Puntos (yo)',   my_avg?.score,    their_avg?.score,    'Puntos (él)'],
        ].map(([lMe, vMe, vThem, lThem]) => (
          <div key={lMe} className="rounded-lg p-2" style={{ background: '#04101E' }}>
            <p className="text-gray-500 mb-0.5">{lMe}</p>
            <p className="text-rl-blue font-semibold">{vMe?.toFixed(1) ?? '—'}</p>
            <p className="text-gray-500 mt-1 mb-0.5">{lThem}</p>
            <p style={{ color }} className="font-semibold">{vThem?.toFixed(1) ?? '—'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReplayRow({ replay, playerName }) {
  const navigate = useNavigate()
  const isWin    = replay.result === 'win'
  const together = replay.context === 'with'
  const s0       = replay.team0_score ?? 0
  const s1       = replay.team1_score ?? 0
  const myScore  = replay.my_team === 0 ? s0 : s1
  const oppScore = replay.my_team === 0 ? s1 : s0

  return (
    <div
      onClick={() => navigate(`/replays/${replay.id}`)}
      className="flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-colors hover:bg-white/5"
      style={{ borderBottom: '1px solid #0D2240' }}
    >
      <span className={`text-xs font-display font-bold px-2 py-0.5 rounded ${isWin ? 'bg-win/20 text-win' : 'bg-loss/20 text-loss'}`}>
        {isWin ? 'V' : 'D'}
      </span>

      <span className="text-xs px-2 py-0.5 rounded font-display"
        style={{ background: together ? '#1A3F8022' : '#7A380022', color: together ? '#3A8EFF' : '#FF7A00' }}>
        {together ? 'juntos' : 'contra'}
      </span>

      <span className="text-gray-100 font-mono-num font-semibold text-sm w-10 text-center">
        {myScore}–{oppScore}
      </span>

      <span className="text-gray-400 text-xs flex-1">{getMapName(replay.map_name)}</span>
      <span className="text-gray-500 text-xs">{formatDate(replay.played_at)}</span>

      {replay.my_stats && (
        <span className="text-gray-500 text-xs font-mono hidden sm:block">
          {replay.my_stats.goals ?? 0}G {replay.my_stats.assists ?? 0}A {replay.my_stats.saves ?? 0}P
        </span>
      )}

      <Link
        to={`/replays/${replay.id}`}
        onClick={e => e.stopPropagation()}
        className="text-gray-600 hover:text-rl-blue text-xs"
      >→</Link>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function PlayerHistory() {
  const { name }                  = useParams()
  const navigate                  = useNavigate()
  const decodedName               = decodeURIComponent(name)
  const [summary, setSummary]     = useState(null)
  const [replays, setReplays]     = useState([])
  const [total, setTotal]         = useState(0)
  const [context, setContext]     = useState(null)   // null | 'with' | 'against'
  const [loading, setLoading]     = useState(true)
  const [loadingMore, setLoadMore]= useState(false)
  const [skip, setSkip]           = useState(0)
  const LIMIT = 30

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.playerSummary(decodedName),
      api.playerReplays(decodedName, null, 0, LIMIT),
    ]).then(([s, r]) => {
      setSummary(s)
      setReplays(r.replays)
      setTotal(r.total)
      setSkip(LIMIT)
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [decodedName])

  const changeContext = useCallback(async (ctx) => {
    setContext(ctx)
    setLoading(true)
    const r = await api.playerReplays(decodedName, ctx, 0, LIMIT).catch(() => ({ replays: [], total: 0 }))
    setReplays(r.replays)
    setTotal(r.total)
    setSkip(LIMIT)
    setLoading(false)
  }, [decodedName])

  const loadMore = useCallback(async () => {
    setLoadMore(true)
    const r = await api.playerReplays(decodedName, context, skip, LIMIT).catch(() => ({ replays: [] }))
    setReplays(prev => [...prev, ...r.replays])
    setSkip(s => s + LIMIT)
    setLoadMore(false)
  }, [decodedName, context, skip])

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      {/* Cabecera */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-300 text-sm">← Atrás</button>
        <span className="text-gray-700">/</span>
        <h1 className="font-display font-bold text-gray-100 text-xl uppercase tracking-wider">
          {decodedName}
        </h1>
      </div>

      {loading && !summary ? (
        <p className="text-gray-500 text-sm">Cargando...</p>
      ) : summary?.total_games === 0 ? (
        <p className="text-gray-500 text-sm">No hay partidas con este jugador.</p>
      ) : (
        <>
          {/* Meta info */}
          <div className="flex items-center gap-4 mb-6 text-xs text-gray-500">
            <span>{summary?.total_games} partidas en total</span>
            {summary?.first_seen && <span>Desde {formatDate(summary.first_seen)}</span>}
            {summary?.last_seen  && <span>Último {formatDate(summary.last_seen)}</span>}
          </div>

          {/* Cards con/contra */}
          <div className="flex gap-4 mb-8">
            <RecordCard
              title="Jugando juntos"
              color="#3A8EFF"
              accent="#1A3F80"
              data={summary?.with}
            />
            <RecordCard
              title="Jugando contra"
              color="#FF7A00"
              accent="#7A3800"
              data={summary?.against}
            />
          </div>

          {/* Filtro de contexto */}
          <div className="flex items-center gap-2 mb-4">
            <p className="text-gray-500 text-xs uppercase tracking-wider font-display mr-2">Filtrar</p>
            {[
              { value: null,      label: 'Todas' },
              { value: 'with',    label: 'Juntos' },
              { value: 'against', label: 'Contra' },
            ].map(opt => (
              <button
                key={String(opt.value)}
                onClick={() => changeContext(opt.value)}
                className="px-3 py-1 rounded-lg text-xs font-display font-semibold transition-colors"
                style={{
                  background: context === opt.value ? '#1A3A5C' : '#071829',
                  color:      context === opt.value ? '#3A8EFF' : '#7B91B0',
                  border:     `1px solid ${context === opt.value ? '#3A8EFF44' : '#1A3A5C'}`,
                }}
              >
                {opt.label}
              </button>
            ))}
            <span className="ml-auto text-gray-600 text-xs">{total} partidas</span>
          </div>

          {/* Lista de replays */}
          <div className="rounded-xl overflow-hidden" style={{ background: '#071829', border: '1px solid #0D2240' }}>
            {loading ? (
              <p className="text-gray-500 text-sm p-4">Cargando...</p>
            ) : replays.length === 0 ? (
              <p className="text-gray-500 text-sm p-4">Sin partidas en este filtro.</p>
            ) : (
              replays.map(r => <ReplayRow key={r.id} replay={r} playerName={decodedName} />)
            )}
          </div>

          {replays.length < total && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="mt-4 w-full py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
              style={{ background: '#071829', border: '1px solid #1A3A5C' }}
            >
              {loadingMore ? 'Cargando...' : `Cargar más (${total - replays.length} restantes)`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
