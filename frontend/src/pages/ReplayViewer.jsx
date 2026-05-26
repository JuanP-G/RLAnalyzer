/**
 * ReplayViewer.jsx — Página del visor 3D.
 *
 * Fuente preferida: Ballchasing.com (abre su visor en el navegador).
 * Fallback:         Visor propio Three.js (Viewer3D.jsx).
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getMapName } from '../utils/mapNames'
import Viewer3D from '../components/Viewer3D'

const TEAM_COLOR = ['#3A8EFF', '#FF7A00']

function fmt(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ReplayViewer() {
  const { id }   = useParams()
  const navigate = useNavigate()

  // ── Estado de datos ───────────────────────────────────────────────────────
  const [replay,    setReplay]    = useState(null)
  const [frames,    setFrames]    = useState(null)
  const [bcStatus,  setBcStatus]  = useState('idle')  // idle | loading | cached | uploaded | no_file | no_token | error
  const [bcUrl,     setBcUrl]     = useState(null)
  const [loadMsg,   setLoadMsg]   = useState('Cargando datos…')
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  // ── Estado de reproducción ────────────────────────────────────────────────
  const [playing,   setPlaying]   = useState(false)
  const [currentT,  setCurrentT]  = useState(0)
  const [speed,     setSpeed]     = useState(1)
  const [duration,  setDuration]  = useState(0)

  const playingRef  = useRef(false)
  const currentTRef = useRef(0)
  const labelRefs   = useRef([])

  useEffect(() => { playingRef.current = playing }, [playing])

  // ── Carga de datos ────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    async function load() {
      try {
        setLoadMsg('Cargando detalles del replay…')
        const r = await api.replay(id)
        if (!alive) return
        setReplay(r)

        // Ballchasing (no bloquea la carga de frames)
        setBcStatus('loading')
        api.ballchasing(id)
          .then(bc => {
            if (!alive) return
            setBcStatus(bc.status)
            setBcUrl(bc.url || null)
          })
          .catch(() => setBcStatus('error'))

        setLoadMsg('Procesando frames (puede tardar ~15-30 s la primera vez)…')
        const f = await api.replayFrames(id)
        if (!alive) return
        setFrames(f)
        setDuration(f.duration || 0)
        setCurrentT(0)
        currentTRef.current = 0
      } catch (e) {
        if (alive) setError(e.message || 'Error cargando frames')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [id])

  // ── Reproducción ──────────────────────────────────────────────────────────
  const handleTimeUpdate = useCallback((t) => {
    currentTRef.current = t
    setCurrentT(t)
    if (t >= duration && duration > 0) setPlaying(false)
  }, [duration])

  const togglePlay = useCallback(() => {
    if (currentTRef.current >= duration) {
      currentTRef.current = 0; setCurrentT(0)
    }
    setPlaying(p => !p)
  }, [duration])

  const seekTo = useCallback(t => {
    currentTRef.current = t; setCurrentT(t)
  }, [])

  // Marcador dinámico
  const scores = useMemo(() => {
    const s = [0, 0]
    if (frames) for (const g of (frames.goals || [])) if (g.time <= currentT) s[g.team ?? 0]++
    return s
  }, [frames, Math.floor(currentT)])

  const team0 = (frames?.players || []).filter(p => p.team === 0)
  const team1 = (frames?.players || []).filter(p => p.team === 1)
  const goalMarkers  = frames?.goals || []
  const safeDuration = duration || 1

  // ── Abrir en Ballchasing ──────────────────────────────────────────────────
  function openBallchasing() {
    if (bcUrl) window.open(bcUrl, '_blank')
  }

  // ── Renders de estado ─────────────────────────────────────────────────────
  if (loading) return (
    <div className="h-full flex flex-col items-center justify-center gap-4" style={{ background: '#04090F' }}>
      <div className="w-8 h-8 rounded-full border-2 border-t-rl-blue border-bg-tertiary animate-spin" />
      <p className="text-gray-400 text-sm">{loadMsg}</p>
    </div>
  )
  if (error) return (
    <div className="h-full flex items-center justify-center px-8" style={{ background: '#04090F' }}>
      <div className="max-w-lg rounded-xl p-6 text-center" style={{ background: '#071829', border: '1px solid #1A3A5C' }}>
        <p className="text-red-400 font-bold uppercase text-sm mb-2">⚠ Error al cargar el visor</p>
        <p className="text-gray-400 text-xs mb-4 font-mono whitespace-pre-wrap text-left max-h-48 overflow-auto">{error}</p>
        <button onClick={() => navigate(-1)} className="text-rl-blue text-sm hover:underline"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}>← Volver</button>
      </div>
    </div>
  )

  // ── Render principal ──────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#04090F' }}>

      {/* ── Barra superior ──────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-1.5"
           style={{ background: '#030810', borderBottom: '1px solid #0A1E35' }}>

        {/* Atrás */}
        <button onClick={() => navigate(-1)}
          className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          ← {replay ? getMapName(replay.map_name) : '—'}
        </button>

        {/* Marcador */}
        <div className="flex items-center gap-0 rounded-lg overflow-hidden mx-auto"
             style={{ border: '1px solid #1A3A5C' }}>
          <div className="px-4 py-1.5 text-lg font-bold font-display text-white"
               style={{ background: '#1A3F80', minWidth: 44, textAlign: 'center' }}>{scores[0]}</div>
          <div className="px-3 py-1 text-sm font-mono-num text-gray-300"
               style={{ background: '#0A1A2E', minWidth: 68, textAlign: 'center' }}>
            {fmt(duration > 0 ? Math.max(0, duration - currentT) : currentT)}
          </div>
          <div className="px-4 py-1.5 text-lg font-bold font-display text-white"
               style={{ background: '#7A3800', minWidth: 44, textAlign: 'center' }}>{scores[1]}</div>
        </div>

        {/* Botón Ballchasing */}
        <BallchasingButton status={bcStatus} url={bcUrl} onClick={openBallchasing} />

        {/* Velocidad */}
        <div className="flex items-center gap-1">
          {[0.25, 0.5, 1, 2].map(v => (
            <button key={v} onClick={() => setSpeed(v)}
              className="px-2 py-0.5 rounded text-xs font-display font-semibold"
              style={{
                background: speed === v ? '#00A8FF22' : '#0D2240',
                color:      speed === v ? '#00A8FF'   : '#5888B4',
                border:     `1px solid ${speed === v ? '#00A8FF55' : '#1A3A5C'}`,
              }}>{v}×</button>
          ))}
        </div>
      </div>

      {/* ── Área central ────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Panel azul */}
        <div className="flex-shrink-0 w-36 flex flex-col gap-1.5 p-2.5 overflow-y-auto"
             style={{ background: '#030810', borderRight: '1px solid #0A1E35' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: TEAM_COLOR[0] }}>Equipo Azul</p>
          {team0.map((p, i) => <PlayerCard key={i} player={p} team={0} />)}
        </div>

        {/* Canvas + etiquetas */}
        <div className="flex-1 relative overflow-hidden">
          <Viewer3D
            frames={frames}
            playing={playing}
            speed={speed}
            currentT={currentT}
            onTimeUpdate={handleTimeUpdate}
            labelRefs={labelRefs}
          />
          {(frames?.players || []).map((p, i) => (
            <div key={i} ref={el => { labelRefs.current[i] = el }}
              className="absolute pointer-events-none"
              style={{ display: 'none', transform: 'translate(-50%, -100%)', zIndex: 10 }}>
              <div className="px-2 py-0.5 rounded-md text-[11px] font-semibold text-white whitespace-nowrap"
                   style={{
                     background: (p.team === 0 ? '#1A3F80' : '#7A3800') + 'DD',
                     border: `1px solid ${TEAM_COLOR[p.team ?? 0]}55`,
                   }}>
                {p.name}
              </div>
            </div>
          ))}
        </div>

        {/* Panel naranja */}
        <div className="flex-shrink-0 w-36 flex flex-col gap-1.5 p-2.5 overflow-y-auto"
             style={{ background: '#030810', borderLeft: '1px solid #0A1E35' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1 text-right" style={{ color: TEAM_COLOR[1] }}>Equipo Naranja</p>
          {team1.map((p, i) => <PlayerCard key={i} player={p} team={1} />)}
        </div>
      </div>

      {/* ── Timeline ────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 py-2.5" style={{ background: '#030810', borderTop: '1px solid #0A1E35' }}>
        {/* Barra + marcadores de gol */}
        <div className="relative mb-2.5" style={{ height: 22 }}>
          {goalMarkers.map((g, i) => (
            <button key={i} onClick={() => seekTo(Math.max(0, g.time - 1.5))}
              className="absolute top-0 h-full flex items-center justify-center"
              style={{ left: `${(g.time / safeDuration) * 100}%`, transform: 'translateX(-50%)', zIndex: 2 }}>
              <div style={{
                width: 2, height: '100%', background: TEAM_COLOR[g.team ?? 0],
                boxShadow: `0 0 5px ${TEAM_COLOR[g.team ?? 0]}`, borderRadius: 2,
              }} />
            </button>
          ))}
          <input type="range" min={0} max={safeDuration} step={0.1} value={currentT}
            onChange={e => seekTo(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer absolute bottom-0"
            style={{ background: `linear-gradient(to right, #2B6FD4 ${(currentT / safeDuration) * 100}%, #0D2240 0%)` }}
          />
        </div>
        {/* Controles */}
        <div className="flex items-center gap-3">
          <button onClick={togglePlay}
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: '#00A8FF22', border: '1px solid #00A8FF55' }}>
            {playing ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="#00A8FF">
                <rect x="0" y="0" width="3.5" height="10" rx="1"/><rect x="6.5" y="0" width="3.5" height="10" rx="1"/>
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="#00A8FF"><polygon points="1,0 10,5 1,10"/></svg>
            )}
          </button>
          <span className="font-mono-num text-sm text-gray-400 flex-shrink-0 tabular-nums">
            {fmt(currentT)} <span className="text-gray-600">/</span> {fmt(safeDuration)}
          </span>
          <div className="flex-1 flex gap-2 justify-end text-xs text-gray-500">
            {goalMarkers.map((g, i) => (
              <button key={i} onClick={() => seekTo(Math.max(0, g.time - 1.5))}
                className="flex items-center gap-1 hover:text-white transition-colors">
                <span className="w-2 h-2 rounded-full" style={{ background: TEAM_COLOR[g.team ?? 0] }} />
                {fmt(g.time)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Botón Ballchasing ─────────────────────────────────────────────────────────
function BallchasingButton({ status, url, onClick }) {
  const isAvailable = url && (status === 'cached' || status === 'uploaded')
  const isLoading   = status === 'loading'
  const isNoToken   = status === 'no_token'
  const isNoFile    = status === 'no_file'

  if (isNoToken || isNoFile) return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs"
         style={{ background: '#071829', border: '1px solid #1A3A5C', color: '#3A5A7A' }}
         title={isNoToken ? 'Añade BALLCHASING_TOKEN en backend/.env' : 'Archivo .replay no disponible'}>
      <BcIcon /> Ballchasing {isNoToken ? '(sin token)' : '(sin archivo)'}
    </div>
  )

  if (isLoading) return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs animate-pulse"
         style={{ background: '#071829', border: '1px solid #1A3A5C', color: '#5888B4' }}>
      <div className="w-3 h-3 rounded-full border border-t-transparent border-rl-blue animate-spin" />
      Subiendo a Ballchasing…
    </div>
  )

  if (isAvailable) return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
      style={{ background: 'linear-gradient(90deg,#1A3F80,#1A4F40)', border: '1px solid #2B6FD466', color: '#90C8FF' }}
      title="Abrir visor 3D de Ballchasing en el navegador">
      <BcIcon color="#90C8FF" /> Ver en Ballchasing
      <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>↗</span>
    </button>
  )

  // error o idle
  return null
}

function BcIcon({ color = '#5888B4' }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5">
      <circle cx="8" cy="8" r="6.5"/>
      <ellipse cx="8" cy="8" rx="3" ry="6.5"/>
      <line x1="1.5" y1="8" x2="14.5" y2="8"/>
    </svg>
  )
}

// ── Tarjeta de jugador ────────────────────────────────────────────────────────
function PlayerCard({ player, team }) {
  return (
    <div className="rounded-lg px-2.5 py-2"
         style={{ background: '#07111E', border: `1px solid ${TEAM_COLOR[team]}28` }}>
      <p className="text-xs font-semibold text-gray-100 truncate">{player.name}</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: '#0D2240' }}>
          <div className="h-full rounded-full" style={{ width: '33%', background: '#FFB800' }} />
        </div>
        <span className="text-[10px] text-gray-600 font-mono-num">33</span>
      </div>
    </div>
  )
}
