import { useEffect, useMemo, useState } from 'react'
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { api } from '../api'
import AbnormalHelp from '../components/AbnormalHelp'

// ── Constantes de estilo ───────────────────────────────────────────────────────
const C = {
  me:    '#00A8FF',  // rl-blue
  mates: '#4FC3F7',  // rl-cyan
  opps:  '#F4620F',  // rl-orange
  win:   '#3DDB85',
  loss:  '#FF4757',
}

const GROUPS = [
  { id: 'offense',  label: 'Ofensiva' },
  { id: 'defense',  label: 'Defensa' },
  { id: 'boost',    label: 'Boost' },
  { id: 'movement', label: 'Movimiento' },
]

const PERIODS = [
  { id: 'all', label: 'Todo' },
  { id: '90',  label: '90 días' },
  { id: '30',  label: '30 días' },
  { id: '7',   label: '7 días' },
]

// ── Helpers ─────────────────────────────────────────────────────────────────────
function fmt(v, unit = '') {
  if (v == null) return '—'
  let n = v
  if (Math.abs(n) >= 1000) n = Math.round(n).toLocaleString('es-ES')
  else if (!Number.isInteger(n)) n = Math.round(n * 100) / 100
  return unit === 's' ? `${n}s` : unit === '%' ? `${n}%` : `${n}`
}

function relPct(a, b) {
  if (a == null || b == null || b === 0) return null
  return Math.round(((a - b) / Math.abs(b)) * 100)
}

function periodToDateFrom(period) {
  if (!period || period === 'all') return undefined
  const d = new Date()
  d.setDate(d.getDate() - Number(period))
  return d.toISOString().slice(0, 10)
}

// ── Punto de info con tooltip ────────────────────────────────────────────────────
function InfoDot({ desc, source }) {
  return (
    <span
      className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] font-bold cursor-help flex-shrink-0"
      style={{ background: '#0D2240', color: '#6590BC', border: '1px solid #122A4D' }}
      title={`${desc}${source ? `\n\nOrigen: ${source}` : ''}`}
    >
      i
    </span>
  )
}

// ── Barra de comparación normalizada ─────────────────────────────────────────────
function CompareBar({ label, value, max, color, unit }) {
  const pct = max > 0 && value != null ? Math.max(2, (value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 w-24 flex-shrink-0">{label}</span>
      <div className="flex-1 h-5 rounded bg-bg-tertiary overflow-hidden relative">
        <div className="h-full rounded transition-all duration-500"
             style={{ width: `${pct}%`, background: color, opacity: 0.85 }} />
      </div>
      <span className="font-mono-num text-xs text-gray-200 w-20 text-right flex-shrink-0">
        {fmt(value, unit)}
      </span>
    </div>
  )
}

function MetricTitle({ m }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-sm font-medium text-gray-200">{m.label}</span>
      <InfoDot desc={m.desc} source={m.source} />
    </span>
  )
}

// Métricas relacionadas que ayudan a explicar el porqué de una diferencia.
// actor: me | teammates | opponents · key: métrica a mirar · hint: pregunta guía
const ACTOR_LABEL = { me: 'Tú', teammates: 'Compañero', opponents: 'Rival' }
const RELATED = {
  saves: [
    { actor: 'opponents', key: 'shots',        hint: '¿el rival tira más?' },
    { actor: 'opponents', key: 'shooting_pct', hint: '¿acierta más a puerta?' },
    { actor: 'teammates', key: 'saves',        hint: '¿para más tu compañero?' },
  ],
  goals: [
    { actor: 'me',        key: 'shots',        hint: '¿tiras más?' },
    { actor: 'me',        key: 'shooting_pct', hint: '¿aciertas más?' },
    { actor: 'opponents', key: 'saves',        hint: '¿para más el rival?' },
  ],
  assists: [
    { actor: 'me',        key: 'shots', hint: '¿generas más juego?' },
    { actor: 'teammates', key: 'goals', hint: '¿marca más tu compañero?' },
  ],
  shots: [
    { actor: 'me',        key: 'shooting_pct', hint: '¿aciertas más?' },
    { actor: 'me',        key: 'goals',        hint: '¿acabas marcando?' },
  ],
  shooting_pct: [
    { actor: 'me',        key: 'shots', hint: '¿sobre cuántos tiros?' },
    { actor: 'me',        key: 'goals', hint: '¿cuántos goles?' },
  ],
  score: [
    { actor: 'me', key: 'goals',   hint: '' },
    { actor: 'me', key: 'assists', hint: '' },
    { actor: 'me', key: 'saves',   hint: '' },
  ],
}

// Fila victorias/derrotas neutral (sin juicio de bueno/malo) para el desglose
function WLRow({ label, hint, wins, losses, unit }) {
  const rp = relPct(wins, losses)
  const arrow = rp == null || rp === 0 ? '' : rp > 0 ? '▲' : '▼'
  return (
    <div className="flex items-center gap-2 text-xs py-0.5">
      <span className="flex-1 truncate text-gray-300">
        {label}{hint ? <span className="text-gray-600"> · {hint}</span> : null}
      </span>
      <span className="font-mono-num" style={{ color: C.win }}>{fmt(wins, unit)}</span>
      <span className="text-gray-600">/</span>
      <span className="font-mono-num" style={{ color: C.loss }}>{fmt(losses, unit)}</span>
      <span className="font-mono-num text-gray-400 w-14 text-right">
        {arrow} {rp != null ? `${rp > 0 ? '+' : ''}${rp}%` : '—'}
      </span>
    </div>
  )
}

// ── Victorias vs derrotas ─────────────────────────────────────────────────────────
function WinLossMetric({ m, allMetrics }) {
  const [open, setOpen] = useState(false)
  const { wins, losses } = m.me
  const max = Math.max(wins ?? 0, losses ?? 0)
  const rp = relPct(wins, losses)
  let deltaColor = '#7B91B0'
  let deltaText = '—'
  if (rp != null) {
    deltaText = `${rp > 0 ? '+' : ''}${rp}%`
    if (m.higher_better != null) {
      const good = m.higher_better ? rp > 0 : rp < 0
      deltaColor = rp === 0 ? '#7B91B0' : good ? C.win : C.loss
    }
  }
  const related = RELATED[m.key] || []

  return (
    <div className="bg-bg-secondary rounded-lg p-3.5" style={{ border: '1px solid #122A4D' }}>
      <div className="flex items-center justify-between mb-2.5">
        <MetricTitle m={m} />
        <span className="text-xs font-mono-num font-bold px-2 py-0.5 rounded"
              style={{ color: deltaColor, background: `${deltaColor}1A` }}
              title="Diferencia entre victorias y derrotas">
          {deltaText}
        </span>
      </div>
      <div className="space-y-1.5">
        <CompareBar label="Victorias" value={wins}   max={max} color={C.win}  unit={m.unit} />
        <CompareBar label="Derrotas"  value={losses} max={max} color={C.loss} unit={m.unit} />
      </div>

      <button onClick={() => setOpen(o => !o)}
        className="mt-2.5 text-[11px] text-rl-blue hover:underline flex items-center gap-1">
        {open ? '▾' : '▸'} ¿Por qué?
      </button>

      {open && (
        <div className="mt-2.5 pt-2.5 space-y-3" style={{ borderTop: '1px solid #122A4D' }}>
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-gray-600">
            <span>Desglose</span>
            <span><span style={{ color: C.win }}>Victorias</span> / <span style={{ color: C.loss }}>Derrotas</span></span>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-gray-400 mb-0.5">{m.label} por jugador</p>
            <WLRow label="Tú"         wins={m.me.wins}        losses={m.me.losses}        unit={m.unit} />
            <WLRow label="Compañeros" wins={m.teammates.wins} losses={m.teammates.losses} unit={m.unit} />
            <WLRow label="Rivales"    wins={m.opponents.wins} losses={m.opponents.losses} unit={m.unit} />
          </div>

          {related.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 mb-0.5">Contexto relacionado</p>
              {related.map((rel, i) => {
                const rm = (allMetrics || []).find(x => x.key === rel.key)
                if (!rm) return null
                const av = rm[rel.actor]
                return (
                  <WLRow key={i} label={`${ACTOR_LABEL[rel.actor]} · ${rm.label}`} hint={rel.hint}
                         wins={av?.wins} losses={av?.losses} unit={rm.unit} />
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tú vs compañeros vs rivales ────────────────────────────────────────────────────
function VsOthersMetric({ m }) {
  const me = m.me.overall
  const mates = m.teammates.overall
  const opps = m.opponents.overall
  const max = Math.max(me ?? 0, mates ?? 0, opps ?? 0)
  return (
    <div className="bg-bg-secondary rounded-lg p-3.5" style={{ border: '1px solid #122A4D' }}>
      <div className="mb-2.5"><MetricTitle m={m} /></div>
      <div className="space-y-1.5">
        <CompareBar label="Tú"         value={me}    max={max} color={C.me}    unit={m.unit} />
        <CompareBar label="Compañeros" value={mates} max={max} color={C.mates} unit={m.unit} />
        <CompareBar label="Rivales"    value={opps}  max={max} color={C.opps}  unit={m.unit} />
      </div>
    </div>
  )
}

// ── Radar del grupo ────────────────────────────────────────────────────────────────
function GroupRadar({ metrics }) {
  const data = metrics.map(m => {
    const mates = m.teammates.overall
    const opps = m.opponents.overall
    const max = Math.max(m.me.overall ?? 0, mates ?? 0, opps ?? 0) || 1
    return {
      metric: m.label,
      Tú:         m.me.overall != null ? Math.round((m.me.overall / max) * 100) : 0,
      Compañeros: mates != null ? Math.round((mates / max) * 100) : 0,
      Rivales:    opps  != null ? Math.round((opps  / max) * 100) : 0,
      _raw: { Tú: m.me.overall, Compañeros: mates, Rivales: opps, unit: m.unit },
    }
  })
  const RadarTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const raw = payload[0]?.payload?._raw || {}
    return (
      <div className="bg-bg-tertiary rounded-lg px-3 py-2 text-xs" style={{ border: '1px solid #122A4D' }}>
        <p className="text-gray-200 font-semibold mb-1">{label}</p>
        {['Tú', 'Compañeros', 'Rivales'].map(k => (
          <p key={k} style={{ color: k === 'Tú' ? C.me : k === 'Compañeros' ? C.mates : C.opps }}>
            {k}: <span className="font-mono-num">{fmt(raw[k], raw.unit)}</span>
          </p>
        ))}
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="#122A4D" />
        <PolarAngleAxis dataKey="metric" tick={{ fill: '#6590BC', fontSize: 11 }} />
        <Radar name="Tú"         dataKey="Tú"         stroke={C.me}    fill={C.me}    fillOpacity={0.30} />
        <Radar name="Compañeros" dataKey="Compañeros" stroke={C.mates} fill={C.mates} fillOpacity={0.12} />
        <Radar name="Rivales"    dataKey="Rivales"    stroke={C.opps}  fill={C.opps}  fillOpacity={0.12} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Tooltip content={<RadarTooltip />} />
      </RadarChart>
    </ResponsiveContainer>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────────
export default function Analysis() {
  const [filters, setFilters] = useState(null)
  const [sel, setSel] = useState({
    team_size: null, category: null, period: 'all',
    exclude_abnormal: true, min_duration: 180, max_goal_diff: 5,
  })
  const [view, setView] = useState('compare')   // compare | trend
  const [data, setData] = useState(null)
  const [trendData, setTrendData] = useState(null)
  const [trendBucket, setTrendBucket] = useState('week')
  const [trendMetric, setTrendMetric] = useState('score')
  const [group, setGroup] = useState('offense')
  const [glossary, setGlossary] = useState(null)
  const [showGlossary, setShowGlossary] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.analysisFilters()
      .then(f => {
        setFilters(f)
        if (f?.defaults) {
          setSel(s => ({ ...s, min_duration: f.defaults.min_duration, max_goal_diff: f.defaults.max_goal_diff }))
        }
      })
      .catch(() => setFilters(null))
  }, [])

  const apiFilters = useMemo(() => ({
    team_size: sel.team_size,
    category: sel.category,
    date_from: periodToDateFrom(sel.period),
    exclude_abnormal: sel.exclude_abnormal,
    min_duration: sel.min_duration,
    max_goal_diff: sel.max_goal_diff,
  }), [sel])
  const filterKey = JSON.stringify(apiFilters)

  useEffect(() => {
    setLoading(true); setError(null)
    api.analysis(apiFilters)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [filterKey])

  useEffect(() => {
    if (view !== 'trend') return
    api.trend({ ...apiFilters, bucket: trendBucket })
      .then(setTrendData)
      .catch(() => setTrendData(null))
  }, [filterKey, trendBucket, view])

  const groupMetrics = useMemo(
    () => (data?.metrics || []).filter(m => m.group === group),
    [data, group],
  )

  function openGlossary() {
    setShowGlossary(v => !v)
    if (!glossary) api.glossary().then(setGlossary).catch(() => {})
  }

  const setF = patch => setSel(s => ({ ...s, ...patch }))

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Cabecera fija con filtros */}
      <div className="px-8 pt-6 pb-4 flex-shrink-0" style={{ borderBottom: '1px solid #122A4D' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display font-bold text-white text-xl tracking-wide">Análisis de rendimiento</h1>
            <p className="text-gray-400 text-sm mt-0.5">
              Cómo cambia tu juego entre victorias y derrotas, cómo te comparas con otros y cómo evolucionas.
            </p>
          </div>
          {/* Switch de vista */}
          <div className="flex gap-1 flex-shrink-0">
            {[{ id: 'compare', label: 'Comparativa' }, { id: 'trend', label: 'Evolución' }].map(v => (
              <button key={v.id} onClick={() => setView(v.id)}
                className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={view === v.id
                  ? { background: 'rgba(0,168,255,0.15)', border: '1px solid rgba(0,168,255,0.35)', color: '#fff' }
                  : { background: '#071829', border: '1px solid #122A4D', color: '#6590BC' }}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {filters && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4">
            <FilterRow title="Periodo" selected={sel.period} onSelect={v => setF({ period: v })}
              options={PERIODS.map(p => ({ value: p.id, label: p.label }))} />
            <FilterRow title="Modo" selected={sel.team_size} onSelect={v => setF({ team_size: v })}
              options={[{ value: null, label: 'Todos' },
                ...filters.team_sizes.map(t => ({ value: t.value, label: `${t.value}v${t.value}`, games: t.games }))]} />
            {filters.categories.length > 0 && (
              <FilterRow title="Categoría" selected={sel.category} onSelect={v => setF({ category: v })}
                options={[{ value: null, label: 'Todas' },
                  ...filters.categories.map(c => ({ value: c.value, label: c.value, games: c.games }))]} />
            )}
          </div>
        )}

        {/* Control de partidas anómalas */}
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <div className="flex items-center gap-1.5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={sel.exclude_abnormal}
                onChange={e => setF({ exclude_abnormal: e.target.checked })}
                style={{ accentColor: C.me }} />
              <span className="text-xs text-gray-300">Excluir partidas anómalas del análisis</span>
            </label>
            <AbnormalHelp minDuration={sel.min_duration} maxGoalDiff={sel.max_goal_diff} />
          </div>
          {sel.exclude_abnormal && (
            <>
              <NumField label="Dur. mín (s)" value={sel.min_duration}
                onChange={v => setF({ min_duration: v })} min={0} step={30} />
              <NumField label="Dif. goles máx" value={sel.max_goal_diff}
                onChange={v => setF({ max_goal_diff: v })} min={1} step={1} />
            </>
          )}
          {data && sel.exclude_abnormal && data.excluded_abnormal > 0 && (
            <span className="text-xs text-gray-500">
              {data.excluded_abnormal} partida{data.excluded_abnormal !== 1 ? 's' : ''} excluida{data.excluded_abnormal !== 1 ? 's' : ''} del análisis (sí cuentan para el win rate)
            </span>
          )}
        </div>
      </div>

      {/* Cuerpo */}
      <div className="flex-1 overflow-y-auto px-8 py-5">
        {loading && <div className="text-gray-500 text-center py-20">Cargando análisis…</div>}
        {error && !loading && (
          <div className="bg-loss/10 border border-loss/30 rounded-xl p-6 text-loss">
            <p className="font-semibold">Error al cargar el análisis</p>
            <p className="text-sm mt-1 text-gray-400">{error}</p>
          </div>
        )}

        {!loading && !error && data && data.games === 0 && (
          <div className="text-center py-20 text-gray-500">
            <p className="text-xl text-gray-300 font-medium">Sin partidas para este filtro</p>
            <p className="text-sm mt-2">Prueba a ampliar el periodo o quitar filtros.</p>
          </div>
        )}

        {!loading && !error && data && data.games > 0 && (
          <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Kpi label="Partidas" value={data.games} color="text-rl-blue" />
              <Kpi label="Victorias" value={data.wins} color="text-win" />
              <Kpi label="Derrotas" value={data.losses} color="text-loss" />
              <Kpi label="Win rate" value={`${data.win_rate}%`} color={data.win_rate >= 50 ? 'text-win' : 'text-loss'} />
              <Kpi label="Analizadas" value={data.analyzed_games} color="text-gray-200"
                   sub={sel.exclude_abnormal ? 'sin anómalas' : 'todas'} />
            </div>

            {view === 'compare' ? (
              <CompareView group={group} setGroup={setGroup} groupMetrics={groupMetrics} allMetrics={data.metrics} />
            ) : (
              <TrendView trendData={trendData} trendBucket={trendBucket} setTrendBucket={setTrendBucket}
                         trendMetric={trendMetric} setTrendMetric={setTrendMetric} />
            )}

            {/* Glosario */}
            <section>
              <button onClick={openGlossary}
                className="text-rl-blue text-sm hover:underline flex items-center gap-1.5">
                {showGlossary ? '▾' : '▸'} ¿Qué significa cada dato y de dónde sale?
              </button>
              {showGlossary && glossary && <Glossary glossary={glossary} />}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Vista Comparativa ──────────────────────────────────────────────────────────────
function CompareView({ group, setGroup, groupMetrics, allMetrics }) {
  const groupLabel = GROUPS.find(g => g.id === group)?.label || ''

  // Insights del grupo activo: mayores diferencias victoria/derrota
  const insights = useMemo(() => {
    const items = []
    for (const m of groupMetrics) {
      if (m.higher_better == null) continue
      const rp = relPct(m.me.wins, m.me.losses)
      if (rp == null || rp === 0) continue
      const good = m.higher_better ? rp > 0 : rp < 0
      items.push({ label: m.label, rp, good, abs: Math.abs(rp) })
    }
    return items.sort((a, b) => b.abs - a.abs)
  }, [groupMetrics])

  return (
    <>
      {/* Pestañas de grupo */}
      <div className="flex gap-1.5 flex-wrap">
        {GROUPS.map(g => (
          <button key={g.id} onClick={() => setGroup(g.id)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={group === g.id
              ? { background: 'rgba(0,168,255,0.15)', border: '1px solid rgba(0,168,255,0.35)', color: '#fff' }
              : { background: '#071829', border: '1px solid #122A4D', color: '#6590BC' }}>
            {g.label}
          </button>
        ))}
      </div>

      {/* Insights del grupo seleccionado */}
      <section>
        <h2 className="font-display font-semibold text-gray-300 text-sm uppercase tracking-widest mb-3">
          Qué cambia cuando ganas · {groupLabel}
        </h2>
        {insights.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {insights.map(ins => (
              <div key={ins.label} className="bg-bg-secondary rounded-lg p-3.5"
                   style={{ border: `1px solid ${ins.good ? C.win : C.loss}40` }}>
                <p className="text-xs text-gray-400">{ins.label}</p>
                <p className="font-mono-num font-bold text-2xl mt-1" style={{ color: ins.good ? C.win : C.loss }}>
                  {ins.rp > 0 ? '+' : ''}{ins.rp}%
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">en victorias vs derrotas</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No hay diferencias destacables en este grupo con los datos actuales.</p>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="bg-bg-secondary rounded-xl p-5" style={{ border: '1px solid #122A4D' }}>
          <h3 className="font-display font-semibold text-gray-200 text-sm uppercase tracking-widest mb-1">
            Tú vs compañeros vs rivales
          </h3>
          <p className="text-xs text-gray-500 mb-3">Valores normalizados (el mayor de cada métrica = 100%).</p>
          {groupMetrics.length >= 3
            ? <GroupRadar metrics={groupMetrics} />
            : <div className="space-y-3 pt-1">{groupMetrics.map(m => <VsOthersMetric key={m.key} m={m} />)}</div>}
        </section>

        <section className="bg-bg-secondary rounded-xl p-5" style={{ border: '1px solid #122A4D' }}>
          <h3 className="font-display font-semibold text-gray-200 text-sm uppercase tracking-widest mb-3">
            Victorias vs derrotas
          </h3>
          <div className="space-y-3">
            {groupMetrics.map(m => <WinLossMetric key={m.key} m={m} allMetrics={allMetrics} />)}
          </div>
        </section>
      </div>

      {groupMetrics.length >= 3 && (
        <section>
          <h3 className="font-display font-semibold text-gray-300 text-sm uppercase tracking-widest mb-3">
            Detalle — tú vs compañeros vs rivales
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {groupMetrics.map(m => <VsOthersMetric key={m.key} m={m} />)}
          </div>
        </section>
      )}
    </>
  )
}

// ── Vista Evolución ──────────────────────────────────────────────────────────────
function TrendView({ trendData, trendBucket, setTrendBucket, trendMetric, setTrendMetric }) {
  const buckets = trendData?.buckets || []
  const meta = trendData?.metric_meta || []
  const metaSel = meta.find(m => m.key === trendMetric) || { label: trendMetric, unit: '' }

  const chartData = buckets.map(b => ({
    label: b.label,
    win_rate: b.win_rate,
    metric: b.metrics?.[trendMetric] ?? null,
    games: b.games,
  }))

  // Resumen primero vs último periodo
  const valid = chartData.filter(d => d.metric != null)
  const first = valid[0]
  const last = valid[valid.length - 1]
  const metricDelta = first && last ? relPct(last.metric, first.metric) : null
  const wrFirst = chartData[0]?.win_rate
  const wrLast = chartData[chartData.length - 1]?.win_rate
  const wrDelta = (wrFirst != null && wrLast != null) ? Math.round(wrLast - wrFirst) : null

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <FilterRow title="Agrupar" selected={trendBucket} onSelect={setTrendBucket}
          options={[{ value: 'week', label: 'Semana' }, { value: 'month', label: 'Mes' }]} />
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-gray-500 font-display font-semibold">Métrica</span>
          <select value={trendMetric} onChange={e => setTrendMetric(e.target.value)}
            className="text-xs rounded px-2 py-1 outline-none"
            style={{ background: '#071829', border: '1px solid #122A4D', color: '#C2D6F5' }}>
            {GROUPS.map(g => (
              <optgroup key={g.id} label={g.label}>
                {meta.filter(m => m.group === g.id).map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {buckets.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-gray-300">Sin datos de evolución</p>
          <p className="text-sm mt-1">Hacen falta partidas con fecha en el periodo seleccionado.</p>
        </div>
      ) : (
        <>
          {/* Resumen de mejora */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Kpi label={`${metaSel.label} (inicio → ahora)`}
                 value={metricDelta != null ? `${metricDelta > 0 ? '+' : ''}${metricDelta}%` : '—'}
                 color={metricDelta == null ? 'text-gray-200' : metricDelta >= 0 ? 'text-win' : 'text-loss'}
                 sub={first && last ? `${fmt(first.metric, metaSel.unit)} → ${fmt(last.metric, metaSel.unit)}` : null} />
            <Kpi label="Win rate (inicio → ahora)"
                 value={wrDelta != null ? `${wrDelta > 0 ? '+' : ''}${wrDelta} pts` : '—'}
                 color={wrDelta == null ? 'text-gray-200' : wrDelta >= 0 ? 'text-win' : 'text-loss'}
                 sub={wrFirst != null ? `${wrFirst}% → ${wrLast}%` : null} />
            <Kpi label="Periodos" value={buckets.length} color="text-rl-blue" sub={trendBucket === 'week' ? 'por semana' : 'por mes'} />
          </div>

          <div className="bg-bg-secondary rounded-xl p-5" style={{ border: '1px solid #122A4D' }}>
            <h3 className="font-display font-semibold text-gray-200 text-sm uppercase tracking-widest mb-3">
              Evolución: {metaSel.label} y win rate
            </h3>
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#122A4D" />
                <XAxis dataKey="label" tick={{ fill: '#6590BC', fontSize: 11 }} stroke="#122A4D" />
                <YAxis yAxisId="left" tick={{ fill: C.me, fontSize: 11 }} stroke="#122A4D" />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]}
                       tick={{ fill: C.win, fontSize: 11 }} stroke="#122A4D" unit="%" />
                <Tooltip contentStyle={{ background: '#0D2240', border: '1px solid #122A4D', borderRadius: 8, fontSize: 12 }}
                         labelStyle={{ color: '#C2D6F5' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="left" type="monotone" dataKey="metric" name={metaSel.label}
                      stroke={C.me} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                <Line yAxisId="right" type="monotone" dataKey="win_rate" name="Win rate (%)"
                      stroke={C.win} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  )
}

// ── Glosario ─────────────────────────────────────────────────────────────────────
function Glossary({ glossary }) {
  return (
    <div className="mt-3 bg-bg-secondary rounded-xl p-5 space-y-4" style={{ border: '1px solid #122A4D' }}>
      <div className="text-sm text-gray-400">
        <p className="font-semibold text-gray-200 mb-1">Partidas anómalas</p>
        <p>{glossary.abnormal?.desc}</p>
        <p className="text-xs text-gray-500 mt-1">
          Por defecto: duración mínima {glossary.abnormal?.min_duration}s · diferencia de goles máxima {glossary.abnormal?.max_goal_diff}.
          Estos valores cuentan igualmente para el win rate.
        </p>
      </div>
      {GROUPS.map(g => {
        const ms = (glossary.metrics || []).filter(m => m.group === g.id)
        if (!ms.length) return null
        return (
          <div key={g.id}>
            <p className="font-display font-semibold text-gray-300 text-xs uppercase tracking-widest mb-2">{g.label}</p>
            <div className="space-y-1.5">
              {ms.map(m => (
                <div key={m.key} className="flex items-start gap-2 text-sm">
                  <span className="text-gray-200 font-medium w-40 flex-shrink-0">{m.label}</span>
                  <span className="text-gray-400 flex-1">{m.desc}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: '#0D2240', color: '#6590BC', border: '1px solid #122A4D' }}>
                    {m.source}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Subcomponentes ───────────────────────────────────────────────────────────────
function FilterRow({ title, options, selected, onSelect }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wider text-gray-500 font-display font-semibold">{title}</span>
      <div className="flex gap-1">
        {options.map(o => (
          <button key={String(o.value)} onClick={() => onSelect(o.value)}
            className="px-2.5 py-1 rounded text-xs font-medium transition-all"
            style={selected === o.value
              ? { background: 'rgba(0,168,255,0.15)', border: '1px solid rgba(0,168,255,0.35)', color: '#fff' }
              : { background: '#071829', border: '1px solid #122A4D', color: '#6590BC' }}
            title={o.games != null ? `${o.games} partidas` : undefined}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function NumField({ label, value, onChange, min, step }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[11px] text-gray-500">{label}</span>
      <input type="number" value={value} min={min} step={step}
        onChange={e => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) onChange(v) }}
        className="w-16 text-xs rounded px-1.5 py-1 outline-none font-mono-num"
        style={{ background: '#071829', border: '1px solid #122A4D', color: '#C2D6F5' }} />
    </label>
  )
}

function Kpi({ label, value, color, sub }) {
  return (
    <div className="bg-bg-secondary rounded-xl p-4" style={{ border: '1px solid #122A4D' }}>
      <p className="text-gray-300 text-[11px] uppercase tracking-wider font-display font-semibold">{label}</p>
      <p className={`font-mono-num font-bold text-2xl mt-1 ${color}`}>{value ?? '—'}</p>
      {sub && <p className="text-gray-400 text-[11px] mt-0.5">{sub}</p>}
    </div>
  )
}
