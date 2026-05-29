import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  PieChart, Pie, Cell, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { api } from '../api'
import StatCard from '../components/StatCard'
import { getMapName } from '../utils/mapNames'

// ── Paleta ──────────────────────────────────────────────────────────────────────
const C = {
  goals:   '#F4620F',
  saves:   '#4FC3F7',
  assists: '#3DDB85',
  shots:   '#00A8FF',
  win:     '#3DDB85',
  loss:    '#FF4757',
  blue:    '#00A8FF',
}

const PERIODS = [
  { id: 'all', label: 'Todo' },
  { id: '7',   label: '7 días' },
  { id: '30',  label: '30 días' },
  { id: '90',  label: '90 días' },
]

function periodToDateFrom(period) {
  if (!period || period === 'all') return null
  const d = new Date()
  d.setDate(d.getDate() - parseInt(period))
  return d.toISOString().slice(0, 10)
}

// ── Helpers de formato ────────────────────────────────────────────────────────
function formatDuration(secs) {
  if (!secs) return '—'
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function ResultBadge({ result }) {
  const cfg = {
    win:     { label: 'V', cls: 'bg-win/20 text-win border-win/30' },
    loss:    { label: 'D', cls: 'bg-loss/20 text-loss border-loss/30' },
    draw:    { label: 'E', cls: 'bg-draw/20 text-draw border-draw/30' },
    unknown: { label: '?', cls: 'bg-gray-700/30 text-gray-400 border-gray-600' },
  }
  const { label, cls } = cfg[result] || cfg.unknown
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold border ${cls}`}>
      {label}
    </span>
  )
}

function StarButton({ isFav, onClick }) {
  return (
    <button
      onClick={onClick}
      title={isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
      className="transition-transform hover:scale-125 focus:outline-none"
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}
    >
      {isFav
        ? <span style={{ color: '#F5C542', fontSize: '0.95rem' }}>★</span>
        : <span style={{ color: '#3A5A7A', fontSize: '0.95rem' }}>☆</span>}
    </button>
  )
}

// ── Controles de filtro ─────────────────────────────────────────────────────────
function Pill({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className="px-3 py-1 rounded-md text-xs font-medium transition-all"
      style={active
        ? { background: 'rgba(0,168,255,0.15)', border: '1px solid rgba(0,168,255,0.35)', color: '#fff' }
        : { background: '#071829', border: '1px solid #122A4D', color: '#6590BC' }}>
      {children}
    </button>
  )
}

function Field({ label, children }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-gray-500 font-display font-semibold">{label}</span>
      <div className="flex gap-1">{children}</div>
    </div>
  )
}

function ChartCard({ title, icon, right, children, className = '' }) {
  return (
    <section className={`bg-bg-secondary rounded-xl p-4 flex flex-col ${className}`} style={{ border: '1px solid #122A4D' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-gray-300 text-xs uppercase tracking-widest flex items-center gap-2">
          {icon && <span className="text-rl-blue">{icon}</span>}{title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  )
}

// ── Tarta de estilo de juego ──────────────────────────────────────────────────
function PlayStylePie({ ps }) {
  const data = [
    { name: 'Goles',       value: ps.goals,   color: C.goals },
    { name: 'Paradas',     value: ps.saves,   color: C.saves },
    { name: 'Asistencias', value: ps.assists, color: C.assists },
  ].filter(d => d.value > 0)
  const total = data.reduce((s, d) => s + d.value, 0)

  if (total === 0) return <Empty msg="Sin datos para este filtro" />

  return (
    <div className="flex-1 flex flex-col">
      <ResponsiveContainer width="100%" height={210}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
               innerRadius={50} outerRadius={82} paddingAngle={2} stroke="none">
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#071829', border: '1px solid #1A3A5C', borderRadius: 10, fontSize: 12 }}
            formatter={(v, n) => [`${v} (${Math.round(v / total * 100)}%)`, n]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-4 mt-1">
        {data.map(d => (
          <div key={d.name} className="text-center">
            <div className="flex items-center gap-1.5 justify-center">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
              <span className="text-[11px] text-gray-400">{d.name}</span>
            </div>
            <p className="font-mono-num font-bold text-sm mt-0.5" style={{ color: d.color }}>
              {Math.round(d.value / total * 100)}%
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tiros: goles vs tiros + % acierto ──────────────────────────────────────────
function ShotTracking({ series, shooting }) {
  if (!series.length) return <Empty msg="Sin datos para este filtro" />

  // Media móvil acumulada: % de acierto global hasta cada punto (línea suave)
  let cumG = 0, cumS = 0
  const chart = series.map(b => {
    cumG += b.goals; cumS += b.shots
    return { ...b, rolling_pct: cumS ? Math.round(cumG / cumS * 1000) / 10 : null }
  })

  const ShotTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const p = payload[0]?.payload || {}
    return (
      <div className="bg-bg-tertiary rounded-lg px-3 py-2 text-xs" style={{ border: '1px solid #1A3A5C' }}>
        <p className="text-gray-200 font-semibold mb-1">{label}</p>
        <p style={{ color: C.goals }}>Goles: <span className="font-mono-num">{p.goals}</span></p>
        <p style={{ color: C.shots }}>Tiros: <span className="font-mono-num">{p.shots}</span></p>
        <p className="text-gray-300">% acierto: <span className="font-mono-num">{p.shooting_pct != null ? `${p.shooting_pct}%` : '—'}</span></p>
        <p style={{ color: C.blue }}>Media acumulada: <span className="font-mono-num">{p.rolling_pct != null ? `${p.rolling_pct}%` : '—'}</span></p>
        <p className="text-gray-500">{p.games} {p.games === 1 ? 'partida' : 'partidas'}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={chart} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
          <CartesianGrid stroke="#0D2240" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#5888B4', fontSize: 10 }} axisLine={false} tickLine={false}
                 interval="preserveStartEnd" />
          <YAxis yAxisId="left" tick={{ fill: '#5888B4', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%"
                 tick={{ fill: '#7AADD4', fontSize: 10 }} axisLine={false} tickLine={false} width={38} />
          <Tooltip content={<ShotTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="left" dataKey="goals" name="Goles" fill={C.goals} radius={[3, 3, 0, 0]} maxBarSize={26} />
          <Bar yAxisId="left" dataKey="shots" name="Tiros" fill={C.shots} radius={[3, 3, 0, 0]} maxBarSize={26} fillOpacity={0.55} />
          <Line yAxisId="right" type="monotone" dataKey="shooting_pct" name="% Acierto"
                stroke={C.win} strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
          <Line yAxisId="right" type="monotone" dataKey="rolling_pct" name="Media acumulada"
                stroke={C.blue} strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-center text-[11px] text-gray-500 mt-1">
        Total: <span className="font-mono-num" style={{ color: C.goals }}>{shooting.goals}</span> goles ·{' '}
        <span className="font-mono-num" style={{ color: C.shots }}>{shooting.shots}</span> tiros ·{' '}
        acierto global <span className="font-mono-num text-gray-300">{shooting.pct != null ? `${shooting.pct}%` : '—'}</span>
      </p>
    </div>
  )
}

// ── Forma reciente (V/D) ────────────────────────────────────────────────────────
function RecentForm({ form }) {
  const { matches, wins, total, win_rate } = form
  if (!total) return <Empty msg="Sin partidas recientes" />
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="flex gap-1.5 flex-wrap flex-1">
        {matches.map(m => (
          <div key={m.id} title={`${getMapName(m.map_name)} · ${m.team0_score}-${m.team1_score}`}
            className="w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold"
            style={{
              background: m.result === 'win' ? 'rgba(61,219,133,0.18)' : m.result === 'loss' ? 'rgba(255,71,87,0.18)' : '#0D2240',
              color:      m.result === 'win' ? C.win : m.result === 'loss' ? C.loss : '#7B91B0',
              border:     `1px solid ${m.result === 'win' ? 'rgba(61,219,133,0.35)' : m.result === 'loss' ? 'rgba(255,71,87,0.35)' : '#1A3A5C'}`,
            }}>
            {m.result === 'win' ? 'V' : m.result === 'loss' ? 'D' : '?'}
          </div>
        ))}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-mono-num font-bold text-xl" style={{ color: win_rate >= 50 ? C.win : C.loss }}>{win_rate}%</p>
        <p className="text-[11px] text-gray-500">{wins}V · {total - wins}D · últimas {total}</p>
      </div>
    </div>
  )
}

function Empty({ msg }) {
  return <div className="flex-1 flex items-center justify-center text-gray-600 text-sm py-8">{msg}</div>
}

// ── Página principal ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [teamSizes, setTeamSizes] = useState([])
  const [data, setData]   = useState(null)
  const [replays, setReplays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [sel, setSel] = useState({
    team_size: null, period: 'all', result: null,
    exclude_abnormal: true, bucket: 'day',
  })

  // Opciones de modo disponibles
  useEffect(() => {
    api.analysisFilters().then(f => setTeamSizes(f?.team_sizes || [])).catch(() => {})
  }, [])

  const apiFilters = useMemo(() => ({
    team_size: sel.team_size,
    result: sel.result,
    date_from: periodToDateFrom(sel.period),
    bucket: sel.bucket,
    exclude_abnormal: sel.exclude_abnormal,
  }), [sel])
  const filterKey = JSON.stringify(apiFilters)

  useEffect(() => {
    setLoading(true); setError(null)
    Promise.all([
      api.dashboard(apiFilters),
      api.replays(0, 7, { result: sel.result, team_size: sel.team_size }),
    ])
      .then(([d, r]) => { setData(d); setReplays(r.replays) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [filterKey])

  const toggleFavorite = useCallback((replay, e) => {
    e.preventDefault(); e.stopPropagation()
    const newVal = !replay.is_favorite
    setReplays(prev => prev.map(r => r.id === replay.id ? { ...r, is_favorite: newVal } : r))
    api.setFavorite(replay.id, newVal).catch(() => {
      setReplays(prev => prev.map(r => r.id === replay.id ? { ...r, is_favorite: !newVal } : r))
    })
  }, [])

  if (error) return (
    <div className="bg-loss/10 border border-loss/30 rounded-xl p-6 m-8 text-loss">
      <p className="font-semibold">Error conectando con el backend</p>
      <p className="text-sm mt-1 text-gray-400">{error}</p>
      <p className="text-sm mt-2 text-gray-500">Asegúrate de que el backend está corriendo y reinícialo si acabas de actualizar.</p>
    </div>
  )

  const k = data?.kpis

  return (
    <div className="h-full overflow-y-auto px-8 py-6 space-y-5">

      {/* ── Barra de filtros ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-5 flex-wrap bg-bg-secondary rounded-xl px-4 py-3"
           style={{ border: '1px solid #122A4D' }}>
        <Field label="Modo">
          <Pill active={sel.team_size == null} onClick={() => setSel(s => ({ ...s, team_size: null }))}>Todos</Pill>
          {teamSizes.map(ts => (
            <Pill key={ts.value} active={sel.team_size === ts.value} onClick={() => setSel(s => ({ ...s, team_size: ts.value }))}>
              {ts.value}v{ts.value}
            </Pill>
          ))}
        </Field>
        <Field label="Periodo">
          {PERIODS.map(p => (
            <Pill key={p.id} active={sel.period === p.id} onClick={() => setSel(s => ({ ...s, period: p.id }))}>
              {p.label}
            </Pill>
          ))}
        </Field>
        <Field label="Resultado">
          <Pill active={sel.result == null} onClick={() => setSel(s => ({ ...s, result: null }))}>Todas</Pill>
          <Pill active={sel.result === 'win'} onClick={() => setSel(s => ({ ...s, result: 'win' }))}>Victorias</Pill>
          <Pill active={sel.result === 'loss'} onClick={() => setSel(s => ({ ...s, result: 'loss' }))}>Derrotas</Pill>
        </Field>
        <Field label="Gráficos">
          <Pill active={sel.bucket === 'day'} onClick={() => setSel(s => ({ ...s, bucket: 'day' }))}>Por día</Pill>
          <Pill active={sel.bucket === 'week'} onClick={() => setSel(s => ({ ...s, bucket: 'week' }))}>Por semana</Pill>
        </Field>
        <label className="flex items-center gap-2 cursor-pointer ml-auto">
          <input type="checkbox" checked={sel.exclude_abnormal}
                 onChange={e => setSel(s => ({ ...s, exclude_abnormal: e.target.checked }))}
                 className="accent-rl-blue w-3.5 h-3.5" />
          <span className="text-xs text-gray-400">Excluir anómalas</span>
        </label>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center h-40 text-gray-500">Cargando datos...</div>
      ) : !k || k.games === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-3xl mb-3">🎮</p>
          <p className="text-lg font-medium text-gray-300">Sin partidas para este filtro</p>
          <p className="mt-1 text-sm">Prueba a ampliar el periodo o quitar filtros.</p>
        </div>
      ) : (
        <>
          {/* ── KPIs ─────────────────────────────────────────────────────── */}
          <section>
            <h2 className="font-display font-semibold text-gray-300 text-sm uppercase tracking-widest mb-3">Resumen</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
              <StatCard label="Partidas"   value={k.games} large />
              <StatCard label="Victorias"  value={k.wins}   color="text-win" />
              <StatCard label="Derrotas"   value={k.losses} color="text-loss" />
              <StatCard label="Win rate"   value={`${k.win_rate}%`} color={k.win_rate >= 50 ? 'text-win' : 'text-loss'} />
              <StatCard label="Med. goles" value={k.avg_goals} sub="por partida" />
              <StatCard label="Med. saves" value={k.avg_saves} sub="por partida" />
              <StatCard label="Med. score" value={k.avg_score} sub="por partida" />
            </div>
          </section>

          {/* ── Gráficos ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <ChartCard title="Estilo de juego" className="lg:col-span-1">
              <PlayStylePie ps={data.play_style} />
            </ChartCard>
            <ChartCard title="Tiros · goles vs tiros" className="lg:col-span-2">
              <ShotTracking series={data.series} shooting={data.shooting} />
            </ChartCard>
          </div>

          <ChartCard title="Forma reciente">
            <RecentForm form={data.recent_form} />
          </ChartCard>

          {/* ── Últimas partidas (compacto) ──────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-semibold text-gray-300 text-sm uppercase tracking-widest">Últimas partidas</h2>
              <Link to="/replays" className="text-rl-blue text-xs hover:underline">Ver todas →</Link>
            </div>
            <div className="bg-bg-secondary rounded-xl overflow-hidden" style={{ border: '1px solid #122A4D' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-widest font-display font-semibold"
                      style={{ background: '#071829', borderBottom: '1px solid #122A4D', color: '#7AADD4' }}>
                    <th className="px-2 py-2 text-center w-8"></th>
                    <th className="px-4 py-2 text-left">Res.</th>
                    <th className="px-4 py-2 text-left">Mapa</th>
                    <th className="px-4 py-2 text-left">Modo</th>
                    <th className="px-4 py-2 text-left">Marcador</th>
                    <th className="px-4 py-2 text-left">Duración</th>
                    <th className="px-4 py-2 text-left">Fecha</th>
                    <th className="px-4 py-2 text-left"></th>
                  </tr>
                </thead>
                <tbody>
                  {replays.map((r, i) => (
                    <tr key={r.id} className="transition-colors hover:bg-bg-hover"
                        style={{ borderBottom: i === replays.length - 1 ? 'none' : '1px solid #0D2240' }}>
                      <td className="px-2 py-2 text-center w-8">
                        <StarButton isFav={r.is_favorite} onClick={(e) => toggleFavorite(r, e)} />
                      </td>
                      <td className="px-4 py-2"><ResultBadge result={r.result} /></td>
                      <td className="px-4 py-2 text-gray-200 font-medium truncate max-w-[180px]">{getMapName(r.map_name)}</td>
                      <td className="px-4 py-2 text-gray-300">
                        {r.match_type
                          ? <span className="text-xs bg-bg-tertiary px-2 py-0.5 rounded text-gray-200">{r.team_size}v{r.team_size} {r.match_type}</span>
                          : '—'}
                      </td>
                      <td className="px-4 py-2 font-mono-num text-gray-200">
                        {r.team0_score != null && r.team1_score != null ? `${r.team0_score} - ${r.team1_score}` : '—'}
                      </td>
                      <td className="px-4 py-2 font-mono-num text-gray-300">{formatDuration(r.duration_secs)}</td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{formatDate(r.played_at)}</td>
                      <td className="px-4 py-2">
                        <Link to={`/replays/${r.id}`} className="text-rl-blue text-xs hover:underline">Ver →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
