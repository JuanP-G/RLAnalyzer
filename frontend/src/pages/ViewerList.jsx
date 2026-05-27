/**
 * ViewerList.jsx — Selector de replays para el Visor 3D.
 * Muestra la lista de partidas y permite abrir cualquiera en el visor 3D.
 */

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { getMapName } from '../utils/mapNames'

const ROW_H    = 48
const THEAD_H  = 41
const MIN_ROWS = 5

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function ResultDot({ result }) {
  const cfg = {
    win:  { color: '#3DDB85', label: 'V' },
    loss: { color: '#FF4757', label: 'D' },
    draw: { color: '#F5C542', label: 'E' },
  }
  const { color, label } = cfg[result] || { color: '#5888B4', label: '?' }
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold"
          style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}>
      {label}
    </span>
  )
}

function FilterChip({ label, active, onClick, color }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
      style={{
        background: active ? (color ? `${color}22` : '#1A3A5C') : '#071829',
        color:      active ? (color || '#7AADD4') : '#5888B4',
        border:     `1px solid ${active ? (color ? `${color}55` : '#2E5A8C') : '#122A4D'}`,
      }}>
      {label}
    </button>
  )
}

export default function ViewerList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const page         = parseInt(searchParams.get('page') || '0')
  const filterResult = searchParams.get('result') || null

  const setPage = useCallback((val) => {
    setSearchParams(p => {
      const next = new URLSearchParams(p)
      const v = typeof val === 'function' ? val(parseInt(p.get('page') || '0')) : val
      v === 0 ? next.delete('page') : next.set('page', String(v))
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setFilterResult = useCallback((val) => {
    setSearchParams(p => {
      const next = new URLSearchParams(p)
      next.delete('page')
      val ? next.set('result', val) : next.delete('result')
      return next
    }, { replace: true })
  }, [setSearchParams])

  const [replays, setReplays] = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [limit,   setLimit]   = useState(15)

  const tableBoxRef = useRef(null)
  const theadRef    = useRef(null)
  const limitRef    = useRef(15)

  const recalc = useCallback(() => {
    const box   = tableBoxRef.current
    const thead = theadRef.current
    if (!box) return
    const boxH      = box.clientHeight
    const headH     = thead ? thead.offsetHeight : THEAD_H
    const available = boxH - headH
    const firstRow  = box.querySelector('tbody tr')
    const rowH      = firstRow ? firstRow.offsetHeight : ROW_H
    const rows      = Math.max(MIN_ROWS, Math.floor(available / rowH))
    if (rows !== limitRef.current) { limitRef.current = rows; setLimit(rows) }
  }, [])

  useLayoutEffect(() => { recalc() }, [recalc])
  useEffect(() => {
    const ro = new ResizeObserver(recalc)
    if (tableBoxRef.current) ro.observe(tableBoxRef.current)
    return () => ro.disconnect()
  }, [recalc])
  useLayoutEffect(() => { if (replays.length > 0) recalc() }, [replays, recalc])

  useEffect(() => {
    setLoading(true)
    const filters = {}
    if (filterResult) filters.result = filterResult
    api.replays(page * limit, limit, filters)
      .then(d => { setReplays(d.replays); setTotal(d.total) })
      .finally(() => setLoading(false))
  }, [page, limit, filterResult])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="h-full flex flex-col px-8 py-6 gap-4 overflow-hidden">

      {/* Encabezado */}
      <div className="flex-shrink-0 space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display font-bold text-gray-100 uppercase tracking-wider flex items-center gap-2"
                style={{ fontSize: '1.25rem' }}>
              <Icon3D />
              Visor 3D
            </h2>
            <p className="text-gray-500 text-xs mt-0.5">
              Selecciona una partida para verla en 3D
              <span className="ml-2 text-gray-700">· {total} disponibles</span>
            </p>
          </div>

          {/* Filtro resultado */}
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 text-[10px] uppercase tracking-wider font-display font-semibold mr-0.5">Resultado</span>
            <FilterChip label="Todos"    active={!filterResult}           onClick={() => setFilterResult(null)} />
            <FilterChip label="Victoria" active={filterResult === 'win'}  onClick={() => setFilterResult(filterResult === 'win'  ? null : 'win')}  color="#3DDB85" />
            <FilterChip label="Derrota"  active={filterResult === 'loss'} onClick={() => setFilterResult(filterResult === 'loss' ? null : 'loss')} color="#FF4757" />
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 flex flex-col min-h-0 gap-3">
        <div ref={tableBoxRef}
             className="flex-1 min-h-0 bg-bg-secondary rounded-xl overflow-hidden"
             style={{ border: '1px solid #122A4D' }}>
          {loading ? (
            <div className="h-full flex items-center justify-center text-gray-500">Cargando…</div>
          ) : replays.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500 text-sm">
              No hay partidas registradas.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead ref={theadRef}>
                <tr className="text-xs uppercase tracking-widest font-display font-semibold"
                    style={{ background: '#071829', borderBottom: '1px solid #122A4D', color: '#7AADD4' }}>
                  <th className="px-4 py-3 text-left w-8"></th>
                  <th className="px-4 py-3 text-left">Mapa</th>
                  <th className="px-4 py-3 text-left">Modo</th>
                  <th className="px-4 py-3 text-center">Marcador</th>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-right pr-5"></th>
                </tr>
              </thead>
              <tbody>
                {replays.map((r, i) => (
                  <tr key={r.id}
                      className="transition-colors hover:bg-bg-hover cursor-pointer group"
                      style={{ borderBottom: i === replays.length - 1 ? 'none' : '1px solid #0D2240' }}
                      onClick={() => navigate(`/viewer/${r.id}`)}>
                    <td className="px-4 py-3">
                      <ResultDot result={r.result} />
                    </td>
                    <td className="px-4 py-3 text-gray-200 max-w-[200px] truncate">
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
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(r.played_at)}</td>
                    <td className="px-4 py-3 text-right pr-5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold transition-all
                                       text-gray-600 group-hover:text-rl-blue">
                        Ver en 3D
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                             stroke="currentColor" strokeWidth="1.5">
                          <polyline points="2,10 10,10 10,2"/>
                          <line x1="10" y1="2" x2="2" y2="10"/>
                        </svg>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginación */}
        <div className="flex-shrink-0 flex items-center justify-center gap-3 h-10">
          {totalPages > 1 && (
            <>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-4 py-2 rounded-lg text-sm text-gray-400 disabled:opacity-30 transition-all hover:text-white"
                style={{ background: '#071829', border: '1px solid #1A3A5C' }}>
                ← Anterior
              </button>
              <span className="text-gray-500 text-sm tabular-nums">
                {page + 1} <span className="text-gray-600">/</span> {totalPages}
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                className="px-4 py-2 rounded-lg text-sm text-gray-400 disabled:opacity-30 transition-all hover:text-white"
                style={{ background: '#071829', border: '1px solid #1A3A5C' }}>
                Siguiente →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Icono 3D (cubo isométrico simple)
function Icon3D() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4"
         strokeLinejoin="round" style={{ color: '#00A8FF' }}>
      <polygon points="9,2 16,6 16,12 9,16 2,12 2,6" opacity="0.25" fill="currentColor" stroke="none"/>
      <polyline points="9,2 16,6 9,10 2,6 9,2"/>
      <line x1="9" y1="10" x2="9" y2="16"/>
      <line x1="16" y1="6" x2="16" y2="12"/>
      <line x1="2" y1="6" x2="2" y2="12"/>
      <line x1="9" y1="16" x2="2" y2="12"/>
      <line x1="9" y1="16" x2="16" y2="12"/>
    </svg>
  )
}
