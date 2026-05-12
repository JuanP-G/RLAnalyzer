import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { getMapName } from '../utils/mapNames'

const ROW_H    = 45   // offsetHeight de cada fila (incluye borde de 1px)
const THEAD_H  = 41   // offsetHeight del <thead> como fallback
const MIN_ROWS = 5

function ResultBadge({ result }) {
  const cfg = {
    win:     { label: 'Victoria',    cls: 'bg-win/20 text-win border-win/30' },
    loss:    { label: 'Derrota',     cls: 'bg-loss/20 text-loss border-loss/30' },
    draw:    { label: 'Empate',      cls: 'bg-draw/20 text-draw border-draw/30' },
    unknown: { label: 'Desconocido', cls: 'bg-gray-700/30 text-gray-400 border-gray-600' },
  }
  const { label, cls } = cfg[result] || cfg.unknown
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${cls}`}>
      {label}
    </span>
  )
}

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

export default function ReplayList() {
  const [replays, setReplays] = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [page,    setPage]    = useState(0)
  const [limit,   setLimit]   = useState(15)

  // Refs para medir el espacio disponible real en el DOM
  const tableBoxRef = useRef(null)  // div que envuelve toda la tabla (flex-1)
  const theadRef    = useRef(null)  // <thead> para medir su altura real
  const limitRef    = useRef(15)

  const recalc = useCallback(() => {
    const box   = tableBoxRef.current
    const thead = theadRef.current
    if (!box) return

    const boxH    = box.clientHeight
    // offsetHeight incluye el borde — imprescindible para no calcular una fila de más
    const headH   = thead ? thead.offsetHeight : THEAD_H
    const available = boxH - headH
    const firstRow = box.querySelector('tbody tr')
    const rowH     = firstRow ? firstRow.offsetHeight : ROW_H
    const rows     = Math.max(MIN_ROWS, Math.floor(available / rowH))

    if (rows !== limitRef.current) {
      limitRef.current = rows
      setLimit(rows)
      setPage(0)
    }
  }, [])

  // Medir justo después del primer render (useLayoutEffect = síncrono, antes del paint)
  useLayoutEffect(() => {
    recalc()
  }, [recalc])

  // Re-medir si cambia el tamaño de la ventana
  useEffect(() => {
    const ro = new ResizeObserver(recalc)
    if (tableBoxRef.current) ro.observe(tableBoxRef.current)
    return () => ro.disconnect()
  }, [recalc])

  // Re-medir cuando los datos cambian — useLayoutEffect para que sea síncrono
  // (antes del paint, evita flash y bucles de estado)
  useLayoutEffect(() => {
    if (replays.length > 0) recalc()
  }, [replays, recalc])

  // Carga de datos
  useEffect(() => {
    setLoading(true)
    api.replays(page * limit, limit)
      .then(d => { setReplays(d.replays); setTotal(d.total) })
      .finally(() => setLoading(false))
  }, [page, limit])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="h-full flex flex-col px-8 py-6 gap-4 overflow-hidden">

      {/* Título */}
      <div className="flex-shrink-0 flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-gray-100 uppercase tracking-wider" style={{ fontSize: '1.25rem' }}>
            Partidas
          </h2>
          <p className="text-gray-500 text-xs mt-0.5">{total} en total</p>
        </div>
      </div>

      {/* Zona central: tabla + paginación */}
      <div className="flex-1 flex flex-col min-h-0 gap-3">

        {/* Contenedor de la tabla — flex-1, llena el espacio entre título y paginación */}
        <div
          ref={tableBoxRef}
          className="flex-1 min-h-0 bg-bg-secondary rounded-xl overflow-hidden"
          style={{ border: '1px solid #122A4D' }}
        >
          {loading ? (
            <div className="h-full flex items-center justify-center text-gray-500">Cargando...</div>
          ) : replays.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500">Sin partidas registradas aún.</div>
          ) : (
            <table className="w-full text-sm">
              <thead ref={theadRef}>
                <tr className="text-xs uppercase tracking-widest font-display font-semibold" style={{ background: '#071829', borderBottom: '1px solid #122A4D', color: '#436D96' }}>
                  <th className="px-4 py-3 text-left">Resultado</th>
                  <th className="px-4 py-3 text-left">Mapa</th>
                  <th className="px-4 py-3 text-left">Modo</th>
                  <th className="px-4 py-3 text-center">Marcador</th>
                  <th className="px-4 py-3 text-left">Duración</th>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {replays.map((r, i) => (
                  <tr
                    key={r.id}
                    className="transition-colors hover:bg-bg-hover"
                    style={{ borderBottom: i === replays.length - 1 ? 'none' : '1px solid #0D2240' }}
                  >
                    <td className="px-4 py-3"><ResultBadge result={r.result} /></td>
                    <td className="px-4 py-3 text-gray-200 truncate max-w-[200px]">
                      {getMapName(r.map_name)}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {r.team_size ? `${r.team_size}v${r.team_size}` : ''}
                      {r.match_type ? ` ${r.match_type}` : ''}
                    </td>
                    <td className="px-4 py-3 font-mono-num text-center">
                      {r.team0_score != null
                        ? <span className={r.result === 'win' ? 'text-win' : r.result === 'loss' ? 'text-loss' : 'text-gray-200'}>
                            {r.team0_score} – {r.team1_score}
                          </span>
                        : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono-num text-gray-400">
                      {formatDuration(r.duration_secs)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {formatDate(r.played_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/replays/${r.id}`} className="text-rl-blue text-xs hover:underline">
                        Detalles →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginación — siempre reserva espacio para evitar saltos de layout */}
        <div className="flex-shrink-0 flex items-center justify-center gap-3 h-10">
          {totalPages > 1 && (
            <>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-4 py-2 rounded-lg text-sm text-gray-400 disabled:opacity-30 transition-all hover:text-white"
              style={{ background: '#071829', border: '1px solid #1A3A5C' }}
              >
                ← Anterior
              </button>
              <span className="text-gray-500 text-sm tabular-nums">
                {page + 1} <span className="text-gray-600">/</span> {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="px-4 py-2 rounded-lg text-sm text-gray-400 disabled:opacity-30 transition-all hover:text-white"
              style={{ background: '#071829', border: '1px solid #1A3A5C' }}
              >
                Siguiente →
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
