import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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

// ── FilterChip ────────────────────────────────────────────────────────────────
function FilterChip({ label, active, onClick, color }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
      style={{
        background: active ? (color ? `${color}22` : '#1A3A5C') : '#071829',
        color:      active ? (color || '#7AADD4') : '#5888B4',
        border:     `1px solid ${active ? (color ? `${color}55` : '#2E5A8C') : '#122A4D'}`,
      }}
    >
      {label}
    </button>
  )
}

export default function ReplayList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Estado persistido en URL para que el botón atrás restaure posición y filtros
  const page           = parseInt(searchParams.get('page') || '0')
  const filterResult   = searchParams.get('result')   || null
  const filterTeamSize = searchParams.get('size') ? parseInt(searchParams.get('size')) : null
  const favOnly        = searchParams.get('fav') === '1'

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

  const setFilterTeamSize = useCallback((val) => {
    setSearchParams(p => {
      const next = new URLSearchParams(p)
      next.delete('page')
      val ? next.set('size', String(val)) : next.delete('size')
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setFavOnly = useCallback((val) => {
    setSearchParams(p => {
      const next = new URLSearchParams(p)
      next.delete('page')
      val ? next.set('fav', '1') : next.delete('fav')
      return next
    }, { replace: true })
  }, [setSearchParams])

  const [replays, setReplays] = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [limit,   setLimit]   = useState(15)

  // Modo "Comparar": seleccionar exactamente 2 partidas para enviarlas a /compare
  const [compareMode, setCompareMode] = useState(false)
  const [selected, setSelected] = useState([])

  const toggleSelect = useCallback((id) => {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 2) return prev   // máximo 2
      return [...prev, id]
    })
  }, [])

  const hasFilters = favOnly || filterResult || filterTeamSize

  const clearFilters = useCallback(() => {
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

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
    const filters = {}
    if (favOnly)        filters.favorite  = true
    if (filterResult)   filters.result    = filterResult
    if (filterTeamSize) filters.team_size = filterTeamSize
    api.replays(page * limit, limit, filters)
      .then(d => { setReplays(d.replays); setTotal(d.total) })
      .finally(() => setLoading(false))
  }, [page, limit, favOnly, filterResult, filterTeamSize])

  const toggleFavorite = useCallback((replay, e) => {
    e.preventDefault()
    e.stopPropagation()
    const newVal = !replay.is_favorite
    // Actualización optimista
    setReplays(prev => prev.map(r => r.id === replay.id ? { ...r, is_favorite: newVal } : r))
    api.setFavorite(replay.id, newVal).catch(() => {
      // Revertir si falla
      setReplays(prev => prev.map(r => r.id === replay.id ? { ...r, is_favorite: !newVal } : r))
    })
  }, [])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="h-full flex flex-col px-8 py-6 gap-4 overflow-hidden">

      {/* Título + filtros */}
      <div className="flex-shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-gray-100 uppercase tracking-wider" style={{ fontSize: '1.25rem' }}>
              Partidas
            </h2>
            <p className="text-gray-400 text-xs mt-0.5">{total} en total</p>
          </div>
        </div>

        {/* Fila de filtros */}
        <div className="flex items-center gap-4 flex-wrap">

          {/* Resultado */}
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 text-[10px] uppercase tracking-wider font-display font-semibold mr-0.5">Resultado</span>
            <FilterChip label="Todos"    active={!filterResult}          onClick={() => { setFilterResult(null);  setPage(0) }} />
            <FilterChip label="Victoria" active={filterResult === 'win'} onClick={() => { setFilterResult(filterResult === 'win'  ? null : 'win');  setPage(0) }} color="#3DDB85" />
            <FilterChip label="Derrota"  active={filterResult === 'loss'} onClick={() => { setFilterResult(filterResult === 'loss' ? null : 'loss'); setPage(0) }} color="#FF4757" />
          </div>

          <div className="w-px h-4 flex-shrink-0" style={{ background: '#122A4D' }} />

          {/* Modo (team size) */}
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 text-[10px] uppercase tracking-wider font-display font-semibold mr-0.5">Modo</span>
            <FilterChip label="Todos" active={!filterTeamSize}        onClick={() => { setFilterTeamSize(null); setPage(0) }} />
            <FilterChip label="1v1"   active={filterTeamSize === 1}   onClick={() => { setFilterTeamSize(filterTeamSize === 1 ? null : 1); setPage(0) }} />
            <FilterChip label="2v2"   active={filterTeamSize === 2}   onClick={() => { setFilterTeamSize(filterTeamSize === 2 ? null : 2); setPage(0) }} />
            <FilterChip label="3v3"   active={filterTeamSize === 3}   onClick={() => { setFilterTeamSize(filterTeamSize === 3 ? null : 3); setPage(0) }} />
          </div>

          <div className="w-px h-4 flex-shrink-0" style={{ background: '#122A4D' }} />

          {/* Favoritas */}
          <button
            onClick={() => { setFavOnly(!favOnly); setPage(0) }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all"
            style={{
              background: favOnly ? '#1A3A5C' : '#071829',
              border: `1px solid ${favOnly ? '#F5C542' : '#122A4D'}`,
              color: favOnly ? '#F5C542' : '#5888B4',
            }}
          >
            <span style={{ fontSize: '0.85rem' }}>{favOnly ? '★' : '☆'}</span>
            Favoritas
          </button>

          <div className="w-px h-4 flex-shrink-0" style={{ background: '#122A4D' }} />

          {/* Comparar */}
          <button
            onClick={() => { setCompareMode(m => !m); setSelected([]) }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all"
            style={{
              background: compareMode ? '#1A3A5C' : '#071829',
              border: `1px solid ${compareMode ? '#00A8FF' : '#122A4D'}`,
              color: compareMode ? '#00A8FF' : '#5888B4',
            }}
          >
            ⇄ Comparar
          </button>
          {compareMode && (
            <button
              onClick={() => { if (selected.length === 2) navigate(`/compare?a=${selected[0]}&b=${selected[1]}`) }}
              disabled={selected.length !== 2}
              className="px-3 py-1 rounded-full text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'rgba(0,168,255,0.15)', border: '1px solid rgba(0,168,255,0.45)', color: '#fff' }}
            >
              Comparar ({selected.length}/2)
            </button>
          )}
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
            <div className="h-full flex flex-col items-center justify-center gap-3">
              {hasFilters ? (
                <>
                  <p className="text-gray-400 text-sm">No hay partidas con estos filtros.</p>
                  <button onClick={clearFilters}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold text-gray-300 hover:text-white transition-colors"
                    style={{ background: '#0D2240', border: '1px solid #1A3A5C' }}>
                    × Limpiar filtros
                  </button>
                </>
              ) : (
                <p className="text-gray-500">Sin partidas registradas aún.</p>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead ref={theadRef}>
                <tr className="text-xs uppercase tracking-widest font-display font-semibold" style={{ background: '#071829', borderBottom: '1px solid #122A4D', color: '#7AADD4' }}>
                  <th className="px-2 py-3 text-center w-8"></th>
                  <th className="px-4 py-3 text-left">Resultado</th>
                  <th className="px-4 py-3 text-left">Mapa</th>
                  <th className="px-4 py-3 text-left">Modo</th>
                  <th className="px-4 py-3 text-center">Marcador</th>
                  <th className="px-4 py-3 text-left">Duración</th>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3" colSpan={2}></th>
                </tr>
              </thead>
              <tbody>
                {replays.map((r, i) => {
                  const isSel = compareMode && selected.includes(r.id)
                  const maxedOut = compareMode && !isSel && selected.length >= 2
                  return (
                  <tr
                    key={r.id}
                    className="transition-colors hover:bg-bg-hover"
                    style={{
                      borderBottom: i === replays.length - 1 ? 'none' : '1px solid #0D2240',
                      background: isSel ? 'rgba(0,168,255,0.08)' : undefined,
                      borderLeft: isSel ? '3px solid #00A8FF' : '3px solid transparent',
                    }}
                  >
                    <td className="px-2 py-3 text-center w-8">
                      {compareMode ? (
                        <input
                          type="checkbox"
                          checked={isSel}
                          disabled={maxedOut}
                          onChange={() => toggleSelect(r.id)}
                          className="accent-rl-blue w-4 h-4 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      ) : (
                        <StarButton isFav={r.is_favorite} onClick={(e) => toggleFavorite(r, e)} />
                      )}
                    </td>
                    <td className="px-4 py-3"><ResultBadge result={r.result} /></td>
                    <td className="px-4 py-3 text-gray-200 truncate max-w-[200px]">
                      {getMapName(r.map_name)}
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-xs">
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
                    <td className="px-4 py-3 font-mono-num text-gray-300">
                      {formatDuration(r.duration_secs)}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {formatDate(r.played_at)}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/viewer/${r.id}`) }}
                        title="Ver en visor 3D"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-all hover:scale-105"
                        style={{
                          background: '#071829',
                          border: '1px solid #122A4D',
                          color: '#5888B4',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#00A8FF'; e.currentTarget.style.borderColor = '#00A8FF44' }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#5888B4'; e.currentTarget.style.borderColor = '#122A4D' }}
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
                          <polygon points="5,0.5 9,3 9,7 5,9.5 1,7 1,3" opacity="0.2" fill="currentColor" stroke="none"/>
                          <polyline points="5,0.5 9,3 5,5.5 1,3 5,0.5"/>
                          <line x1="5" y1="5.5" x2="5" y2="9.5"/>
                          <line x1="9" y1="3" x2="9" y2="7"/>
                          <line x1="1" y1="3" x2="1" y2="7"/>
                          <line x1="5" y1="9.5" x2="1" y2="7"/>
                          <line x1="5" y1="9.5" x2="9" y2="7"/>
                        </svg>
                        3D
                      </button>
                    </td>
                    <td className="px-2 py-3">
                      <Link to={`/replays/${r.id}`} className="text-rl-blue text-xs hover:underline">
                        Detalles →
                      </Link>
                    </td>
                  </tr>
                  )
                })}
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
