import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import StatCard from '../components/StatCard'
import { getMapName } from '../utils/mapNames'

const ROW_H   = 45  // offsetHeight de cada fila (incluye borde 1px)
const THEAD_H = 41  // offsetHeight del thead como fallback

function ResultBadge({ result }) {
  const cfg = {
    win:     { label: 'V',  cls: 'bg-win/20 text-win border-win/30' },
    loss:    { label: 'D',  cls: 'bg-loss/20 text-loss border-loss/30' },
    draw:    { label: 'E',  cls: 'bg-draw/20 text-draw border-draw/30' },
    unknown: { label: '?',  cls: 'bg-gray-700/30 text-gray-400 border-gray-600' },
  }
  const { label, cls } = cfg[result] || cfg.unknown
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold border ${cls}`}>
      {label}
    </span>
  )
}

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

function StarButton({ isFav, onClick }) {
  return (
    <button
      onClick={onClick}
      title={isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
      className="transition-transform hover:scale-125 focus:outline-none"
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}
    >
      {isFav
        ? <span style={{ color: '#F5C542', fontSize: '1rem' }}>★</span>
        : <span style={{ color: '#3A5A7A', fontSize: '1rem' }}>☆</span>}
    </button>
  )
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null)
  const [replays, setReplays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [limit,   setLimit]   = useState(10)

  const tableBoxRef = useRef(null)
  const theadRef    = useRef(null)
  const limitRef    = useRef(10)

  // Calcular cuántas filas caben exactamente en el contenedor
  const recalc = useCallback(() => {
    const box   = tableBoxRef.current
    const thead = theadRef.current
    if (!box) return
    const headH    = thead ? thead.offsetHeight : THEAD_H
    const available = box.clientHeight - headH
    const firstRow  = box.querySelector('tbody tr')
    const rowH      = firstRow ? firstRow.offsetHeight : ROW_H
    const rows      = Math.max(3, Math.floor(available / rowH))
    if (rows !== limitRef.current) {
      limitRef.current = rows
      setLimit(rows)
    }
  }, [])

  useLayoutEffect(() => { recalc() }, [recalc])

  useLayoutEffect(() => {
    if (replays.length > 0) recalc()
  }, [replays, recalc])

  useEffect(() => {
    const ro = new ResizeObserver(recalc)
    if (tableBoxRef.current) ro.observe(tableBoxRef.current)
    return () => ro.disconnect()
  }, [recalc])

  useEffect(() => {
    setLoading(true)
    Promise.all([api.summary(), api.replays(0, limit)])
      .then(([s, r]) => { setSummary(s); setReplays(r.replays) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [limit])

  const toggleFavorite = useCallback((replay, e) => {
    e.preventDefault()
    e.stopPropagation()
    const newVal = !replay.is_favorite
    setReplays(prev => prev.map(r => r.id === replay.id ? { ...r, is_favorite: newVal } : r))
    api.setFavorite(replay.id, newVal).catch(() => {
      setReplays(prev => prev.map(r => r.id === replay.id ? { ...r, is_favorite: !newVal } : r))
    })
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-full text-gray-500">
      Cargando datos...
    </div>
  )

  if (error) return (
    <div className="bg-loss/10 border border-loss/30 rounded-xl p-6 m-8 text-loss">
      <p className="font-semibold">Error conectando con el backend</p>
      <p className="text-sm mt-1 text-gray-400">{error}</p>
      <p className="text-sm mt-2 text-gray-500">
        Asegúrate de que el backend está corriendo en http://localhost:8000
      </p>
    </div>
  )

  if (!summary || summary.total_replays === 0) return (
    <div className="text-center py-20 text-gray-500">
      <p className="text-4xl mb-4">🎮</p>
      <p className="text-xl font-medium text-gray-300">Sin replays todavía</p>
      <p className="mt-2 text-sm">
        Juega una partida en Rocket League y se procesará automáticamente.
      </p>
      <p className="mt-1 text-xs text-gray-600">
        O revisa que <code className="text-rl-blue">REPLAYS_FOLDER</code> en config.py apunta a la carpeta correcta.
      </p>
    </div>
  )

  return (
    <div className="h-full flex flex-col px-8 py-6 gap-5 overflow-hidden">

      {/* KPIs */}
      <section className="flex-shrink-0">
        <h2 className="font-display font-semibold text-gray-300 text-sm uppercase tracking-widest mb-3">Resumen global</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          <StatCard label="Partidas"   value={summary.total_replays} large />
          <StatCard label="Victorias"  value={summary.wins}   color="text-win" />
          <StatCard label="Derrotas"   value={summary.losses} color="text-loss" />
          <StatCard label="Win rate"   value={`${summary.win_rate}%`} color={summary.win_rate >= 50 ? 'text-win' : 'text-loss'} />
          <StatCard label="Med. goles" value={summary.avg_goals}   sub="por partida" />
          <StatCard label="Med. saves" value={summary.avg_saves}   sub="por partida" />
          <StatCard label="Med. score" value={summary.avg_score}   sub="por partida" />
        </div>
      </section>

      {/* Últimas partidas — llena el espacio restante sin scroll */}
      <section className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <h2 className="font-display font-semibold text-gray-300 text-sm uppercase tracking-widest">Últimas partidas</h2>
          <Link to="/replays" className="text-rl-blue text-xs hover:underline">Ver todas →</Link>
        </div>

        <div
          ref={tableBoxRef}
          className="flex-1 min-h-0 bg-bg-secondary rounded-xl overflow-hidden"
          style={{ border: '1px solid #122A4D' }}
        >
          <table className="w-full text-sm">
            <thead ref={theadRef}>
              <tr className="text-xs uppercase tracking-widest font-display font-semibold" style={{ background: '#071829', borderBottom: '1px solid #122A4D', color: '#7AADD4' }}>
                <th className="px-2 py-3 text-center w-8"></th>
                <th className="px-4 py-3 text-left">Resultado</th>
                <th className="px-4 py-3 text-left">Mapa</th>
                <th className="px-4 py-3 text-left">Modo</th>
                <th className="px-4 py-3 text-left">Marcador</th>
                <th className="px-4 py-3 text-left">Duración</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody>
              {replays.map((r, i) => (
                <tr
                  key={r.id}
                  className="transition-colors hover:bg-bg-hover"
                  style={{ borderBottom: i === replays.length - 1 ? 'none' : '1px solid #0D2240' }}
                >
                  <td className="px-2 py-3 text-center w-8">
                    <StarButton isFav={r.is_favorite} onClick={(e) => toggleFavorite(r, e)} />
                  </td>
                  <td className="px-4 py-3">
                    <ResultBadge result={r.result} />
                  </td>
                  <td className="px-4 py-3 text-gray-200 font-medium truncate max-w-[180px]">
                    {getMapName(r.map_name)}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {r.match_type ? (
                      <span className="text-xs bg-bg-tertiary px-2 py-0.5 rounded text-gray-200">
                        {r.team_size}v{r.team_size} {r.match_type}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono-num text-gray-200">
                    {r.team0_score != null && r.team1_score != null
                      ? `${r.team0_score} - ${r.team1_score}` : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono-num text-gray-300">
                    {formatDuration(r.duration_secs)}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {formatDate(r.played_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/replays/${r.id}`} className="text-rl-blue text-xs hover:underline">
                      Ver →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  )
}
