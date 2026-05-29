import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { getMapName } from '../utils/mapNames'
import {
  metricValue, deltaInfo, formatMetric, formatDelta, buildSummary,
} from '../utils/compareStats'

// ── Paleta ──────────────────────────────────────────────────────────────────────
const C = {
  me:      '#00A8FF',
  myteam:  '#4FC3F7',
  rival:   '#F4620F',
  win:     '#3DDB85',
  loss:    '#FF4757',
  neutral: '#7B91B0',
}

const GROUPS = [
  { id: 'offense',  label: 'Ofensiva' },
  { id: 'defense',  label: 'Defensa' },
  { id: 'boost',    label: 'Boost' },
  { id: 'movement', label: 'Movimiento' },
]

const ROLES = [
  { id: 'me',     label: 'Yo',           color: C.me },
  { id: 'myteam', label: 'Mi equipo',    color: C.myteam },
  { id: 'rival',  label: 'Equipo rival', color: C.rival },
]

const RESULT_CFG = {
  win:     { label: 'Victoria',    color: C.win },
  loss:    { label: 'Derrota',     color: C.loss },
  draw:    { label: 'Empate',      color: C.neutral },
  unknown: { label: 'Desconocido', color: C.neutral },
}

// ── Helpers de formato ────────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(secs) {
  if (!secs) return '—'
  const m = Math.floor(secs / 60), s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function colorOf(token) {
  return token === 'win' ? C.win : token === 'loss' ? C.loss : C.neutral
}

// ── Tarjeta de partida (cabecera A / B) ──────────────────────────────────────────
function MatchCard({ replay, badge, badgeColor }) {
  const cfg = RESULT_CFG[replay.result] || RESULT_CFG.unknown
  return (
    <div className="flex-1 bg-bg-secondary rounded-xl p-4" style={{ border: `1px solid ${badgeColor}55` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold px-2 py-0.5 rounded font-display tracking-wider"
              style={{ background: `${badgeColor}22`, color: badgeColor, border: `1px solid ${badgeColor}55` }}>
          {badge}
        </span>
        <span className="text-xs font-semibold px-2 py-0.5 rounded"
              style={{ background: `${cfg.color}22`, color: cfg.color }}>
          {cfg.label}
        </span>
      </div>
      <p className="text-gray-100 font-medium truncate">{getMapName(replay.map_name)}</p>
      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
        <span className="font-mono-num text-gray-200">
          {replay.team0_score ?? '—'} - {replay.team1_score ?? '—'}
        </span>
        <span>{replay.team_size}v{replay.team_size}{replay.match_type ? ` · ${replay.match_type}` : ''}</span>
        <span>{formatDuration(replay.duration_secs)}</span>
      </div>
      <p className="text-[11px] text-gray-500 mt-0.5">{formatDate(replay.played_at)}</p>
    </div>
  )
}

// ── Selector de partida ───────────────────────────────────────────────────────────
function PickerColumn({ side, color, replays, selectedId, disabledId, onPick }) {
  return (
    <div className="flex-1 bg-bg-secondary rounded-xl overflow-hidden" style={{ border: '1px solid #122A4D' }}>
      <div className="px-4 py-2.5 font-display font-semibold text-sm uppercase tracking-widest"
           style={{ background: '#071829', borderBottom: '1px solid #122A4D', color }}>
        Partida {side}
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {replays.map(r => {
          const isSel = String(r.id) === String(selectedId)
          const isDisabled = String(r.id) === String(disabledId)
          const cfg = RESULT_CFG[r.result] || RESULT_CFG.unknown
          return (
            <button
              key={r.id}
              disabled={isDisabled}
              onClick={() => onPick(r.id)}
              className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                borderBottom: '1px solid #0D2240',
                background: isSel ? `${color}1A` : 'transparent',
                borderLeft: isSel ? `3px solid ${color}` : '3px solid transparent',
              }}
              onMouseEnter={e => { if (!isSel && !isDisabled) e.currentTarget.style.background = '#0D2240' }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent' }}
            >
              <span className="w-1.5 h-6 rounded flex-shrink-0" style={{ background: cfg.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200 truncate">{getMapName(r.map_name)}</p>
                <p className="text-[11px] text-gray-500">{formatDate(r.played_at)}</p>
              </div>
              <span className="font-mono-num text-xs text-gray-300 flex-shrink-0">
                {r.team0_score ?? '—'}-{r.team1_score ?? '—'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Fila de métrica en la tabla comparativa ──────────────────────────────────────
function MetricRow({ m, a, b }) {
  const { delta, color } = deltaInfo(a, b, m.higher_better)
  return (
    <tr style={{ borderBottom: '1px solid #0D2240' }}>
      <td className="px-4 py-2 text-gray-300 text-sm" title={m.desc}>{m.label}</td>
      <td className="px-4 py-2 text-right font-mono-num" style={{ color: C.me }}>{formatMetric(a, m.unit)}</td>
      <td className="px-4 py-2 text-right font-mono-num text-gray-200">{formatMetric(b, m.unit)}</td>
      <td className="px-4 py-2 text-right font-mono-num font-bold" style={{ color: colorOf(color) }}>
        {formatDelta(delta, m.unit)}
      </td>
    </tr>
  )
}

// ── Panel "qué hiciste distinto" ───────────────────────────────────────────────────
function SummaryPanel({ replayA, replayB, metrics, role }) {
  const items = useMemo(
    () => buildSummary(replayA, replayB, metrics, role),
    [replayA, replayB, metrics, role],
  )
  const roleLabel = role === 'me' ? 'Tú' : role === 'myteam' ? 'Tu equipo' : 'El equipo rival'

  return (
    <div className="bg-bg-secondary rounded-xl p-4" style={{ border: '1px solid #122A4D' }}>
      <h3 className="font-display font-semibold text-gray-300 text-xs uppercase tracking-widest mb-3">
        Qué hiciste distinto ({roleLabel.toLowerCase()})
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">Rendimiento muy similar entre ambas partidas.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map(it => {
            const col = it.better == null ? C.neutral : it.better ? C.win : C.loss
            const moreLess = it.delta > 0 ? 'Más' : 'Menos'
            const rel = Math.round(it.relPct)
            return (
              <li key={it.key} className="flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: col }} />
                <span className="text-gray-300">{moreLess} {it.label.toLowerCase()}</span>
                <span className="font-mono-num font-semibold" style={{ color: col }}>
                  {formatDelta(it.delta, it.unit)}{rel ? ` (${rel > 0 ? '+' : ''}${rel}%)` : ''}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Página principal ────────────────────────────────────────────────────────────
export default function Compare() {
  const [searchParams, setSearchParams] = useSearchParams()
  const aId = searchParams.get('a')
  const bId = searchParams.get('b')

  const [replays, setReplays] = useState([])        // para los selectores
  const [replayA, setReplayA] = useState(null)
  const [replayB, setReplayB] = useState(null)
  const [metrics, setMetrics] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [role, setRole] = useState('me')

  const bothChosen = aId && bId

  // Lista de partidas para los selectores (solo cuando faltan params)
  useEffect(() => {
    if (bothChosen) return
    api.replays(0, 40, {}).then(r => setReplays(r.replays || [])).catch(() => setReplays([]))
  }, [bothChosen])

  // Carga de los dos replays + glosario
  useEffect(() => {
    if (!bothChosen) { setReplayA(null); setReplayB(null); return }
    setLoading(true); setError(null)
    Promise.all([api.replay(aId), api.replay(bId), api.glossary()])
      .then(([a, b, g]) => {
        setReplayA(a); setReplayB(b); setMetrics(g?.metrics || [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [aId, bId, bothChosen])

  const setSide = (side, id) => {
    const next = new URLSearchParams(searchParams)
    next.set(side, id)
    setSearchParams(next)
  }

  // ── Selectores (faltan A o B) ────────────────────────────────────────────────
  if (!bothChosen) {
    return (
      <div className="h-full overflow-y-auto px-8 py-6">
        <h2 className="font-display font-bold text-gray-200 text-xl mb-1">Comparar partidas</h2>
        <p className="text-sm text-gray-500 mb-5">Elige dos partidas para comparar tus stats y las de ambos equipos.</p>
        <div className="flex gap-5">
          <PickerColumn side="A" color={C.me} replays={replays}
            selectedId={aId} disabledId={bId} onPick={id => setSide('a', id)} />
          <PickerColumn side="B" color={C.rival} replays={replays}
            selectedId={bId} disabledId={aId} onPick={id => setSide('b', id)} />
        </div>
      </div>
    )
  }

  if (error) return (
    <div className="bg-loss/10 border border-loss/30 rounded-xl p-6 m-8 text-loss">
      <p className="font-semibold">No se pudieron cargar las partidas</p>
      <p className="text-sm mt-1 text-gray-400">{error}</p>
      <button onClick={() => setSearchParams({})}
        className="mt-3 text-sm text-rl-blue hover:underline">← Elegir partidas</button>
    </div>
  )

  if (loading || !replayA || !replayB) {
    return <div className="flex items-center justify-center h-40 text-gray-500">Cargando partidas...</div>
  }

  const sameMatch = String(aId) === String(bId)
  const diffSize = replayA.team_size !== replayB.team_size

  return (
    <div className="h-full overflow-y-auto px-8 py-6 space-y-5">
      {/* Cabecera A vs B */}
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-gray-200 text-xl">Comparar partidas</h2>
        <button onClick={() => setSearchParams({})}
          className="text-sm text-rl-blue hover:underline">Cambiar partidas</button>
      </div>

      {sameMatch && (
        <div className="bg-bg-tertiary rounded-lg px-4 py-2 text-sm text-gray-400" style={{ border: '1px solid #1A3A5C' }}>
          Has elegido la misma partida dos veces: todas las diferencias serán cero.
        </div>
      )}

      <div className="flex items-stretch gap-3">
        <MatchCard replay={replayA} badge="PARTIDA A" badgeColor={C.me} />
        <div className="flex items-center font-display font-bold text-gray-600">VS</div>
        <MatchCard replay={replayB} badge="PARTIDA B" badgeColor={C.rival} />
      </div>

      {/* Pestañas de rol */}
      <div className="flex gap-2">
        {ROLES.map(rl => (
          <button key={rl.id} onClick={() => setRole(rl.id)}
            className="px-4 py-1.5 rounded-md text-sm font-medium transition-all"
            style={role === rl.id
              ? { background: `${rl.color}26`, border: `1px solid ${rl.color}59`, color: '#fff' }
              : { background: '#071829', border: '1px solid #122A4D', color: '#6590BC' }}>
            {rl.label}
          </button>
        ))}
      </div>

      <SummaryPanel replayA={replayA} replayB={replayB} metrics={metrics} role={role} />

      {diffSize && role !== 'me' && (
        <div className="bg-bg-tertiary rounded-lg px-4 py-2 text-xs text-gray-400" style={{ border: '1px solid #1A3A5C' }}>
          Tamaños de equipo distintos ({replayA.team_size}v{replayA.team_size} vs {replayB.team_size}v{replayB.team_size}):
          los totales de equipo no son directamente comparables (sí lo son las medias y tus stats individuales).
        </div>
      )}

      {/* Tabla comparativa por grupos */}
      <div className="bg-bg-secondary rounded-xl overflow-hidden" style={{ border: '1px solid #122A4D' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-widest font-display font-semibold"
                style={{ background: '#071829', borderBottom: '1px solid #122A4D', color: '#7AADD4' }}>
              <th className="px-4 py-2 text-left">Métrica</th>
              <th className="px-4 py-2 text-right" style={{ color: C.me }}>Partida A</th>
              <th className="px-4 py-2 text-right">Partida B</th>
              <th className="px-4 py-2 text-right">Δ (A−B)</th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.map(g => {
              const groupMetrics = metrics.filter(m => m.group === g.id)
              if (groupMetrics.length === 0) return null
              return (
                <FragmentGroup key={g.id} label={g.label}>
                  {groupMetrics.map(m => (
                    <MetricRow key={m.key} m={m}
                      a={metricValue(replayA, role, m.key)}
                      b={metricValue(replayB, role, m.key)} />
                  ))}
                </FragmentGroup>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Sub-cabecera de grupo + sus filas (fragmento para mantener <tbody> válido)
function FragmentGroup({ label, children }) {
  return (
    <>
      <tr style={{ background: '#0A1E36' }}>
        <td colSpan={4} className="px-4 py-1.5 text-[10px] uppercase tracking-widest font-display font-semibold text-gray-500">
          {label}
        </td>
      </tr>
      {children}
    </>
  )
}
