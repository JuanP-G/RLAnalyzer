/**
 * ReplayViewer.jsx — Visor 3D de replays.
 *
 * Flujo:
 *   1. Intenta subir el replay a Ballchasing → si ok, muestra botón para abrir su visor 3D.
 *   2. Si falla (sin token / límite / error) → pantalla de aviso + botón "Continuar con visor propio".
 *   3. Solo cuando el usuario elige el visor propio se cargan y procesan los frames (15-30 s).
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

// Mensajes legibles para cada status de Ballchasing
const BC_REASON = {
  no_token:      'No hay token de Ballchasing configurado.\nAñade BALLCHASING_TOKEN en backend/.env',
  no_file:       'El archivo .replay no está disponible en este equipo.',
  limit_exceeded:'Has alcanzado el límite de subidas de Ballchasing.\nPuedes seguir usando el visor propio.',
  error:         'No se pudo conectar con Ballchasing.',
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ReplayViewer() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const [replay,  setReplay]  = useState(null)

  /**
   * viewerState:
   *   'uploading'  — intentando subir a Ballchasing
   *   'bc_ready'   — URL de Ballchasing disponible, mostrar botón
   *   'bc_failed'  — Ballchasing no disponible, mostrar aviso
   *   'our_viewer' — cargar y mostrar nuestro visor Three.js
   */
  const [viewerState, setViewerState] = useState('uploading')
  const [bcUrl,       setBcUrl]       = useState(null)
  const [bcStatus,    setBcStatus]    = useState(null)  // status raw del backend
  const [bcError,     setBcError]     = useState(null)

  // Solo se usan en estado 'our_viewer'
  const [frames,    setFrames]    = useState(null)
  const [framesMsg, setFramesMsg] = useState('Preparando frames…')
  const [framesErr, setFramesErr] = useState(null)
  const [playing,   setPlaying]   = useState(false)
  const [currentT,  setCurrentT]  = useState(0)
  const [speed,     setSpeed]     = useState(1)
  const [duration,  setDuration]  = useState(0)

  const currentTRef = useRef(0)
  const labelRefs   = useRef([])

  // ── Carga inicial: replay metadata + intento Ballchasing ─────────────────
  useEffect(() => {
    let alive = true
    async function init() {
      try {
        const r = await api.replay(id)
        if (!alive) return
        setReplay(r)
      } catch (e) {
        // Si falla el metadata vamos directo al visor propio con error
        if (alive) { setBcStatus('error'); setBcError(e.message); setViewerState('bc_failed') }
        return
      }

      try {
        const bc = await api.ballchasing(id)
        if (!alive) return
        setBcStatus(bc.status)
        if (bc.url) {
          setBcUrl(bc.url)
          setViewerState('bc_ready')
        } else {
          setBcError(bc.error || null)
          setViewerState('bc_failed')
        }
      } catch (e) {
        if (alive) { setBcStatus('error'); setBcError(e.message); setViewerState('bc_failed') }
      }
    }
    init()
    return () => { alive = false }
  }, [id])

  // ── Carga de frames (solo cuando el usuario elige el visor propio) ────────
  useEffect(() => {
    if (viewerState !== 'our_viewer') return
    if (frames) return  // ya cargados
    let alive = true
    async function loadFrames() {
      try {
        setFramesMsg('Procesando frames (puede tardar ~15-30 s la primera vez)…')
        const f = await api.replayFrames(id)
        if (!alive) return
        setFrames(f)
        setDuration(f.duration || 0)
        setCurrentT(0); currentTRef.current = 0
      } catch (e) {
        if (alive) setFramesErr(e.message || 'Error cargando frames')
      }
    }
    loadFrames()
    return () => { alive = false }
  }, [viewerState, id])

  // ── Controles de reproducción ─────────────────────────────────────────────
  const handleTimeUpdate = useCallback((t) => {
    currentTRef.current = t; setCurrentT(t)
    if (t >= duration && duration > 0) setPlaying(false)
  }, [duration])

  const togglePlay = useCallback(() => {
    if (currentTRef.current >= duration) { currentTRef.current = 0; setCurrentT(0) }
    setPlaying(p => !p)
  }, [duration])

  const seekTo = useCallback(t => { currentTRef.current = t; setCurrentT(t) }, [])

  const scores = useMemo(() => {
    const s = [0, 0]
    if (frames) for (const g of (frames.goals || [])) if (g.time <= currentT) s[g.team ?? 0]++
    return s
  }, [frames, Math.floor(currentT)])

  // ── Renders por estado ────────────────────────────────────────────────────

  // Barra de navegación superior (compartida por todos los estados)
  const TopBar = ({ children }) => (
    <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3"
         style={{ background: '#030810', borderBottom: '1px solid #0A1E35' }}>
      <button onClick={() => navigate(-1)}
        className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
        ←
      </button>
      <span className="text-gray-300 text-sm font-display font-semibold tracking-wide">
        {replay ? getMapName(replay.map_name) : '—'}
      </span>
      {children}
    </div>
  )

  // ── Estado: subiendo a Ballchasing ────────────────────────────────────────
  if (viewerState === 'uploading') return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#04090F' }}>
      <TopBar />
      <div className="flex-1 flex flex-col items-center justify-center gap-5">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-t-rl-blue border-transparent animate-spin" />
          <div className="absolute inset-2 flex items-center justify-center">
            <BcIcon size={24} color="#2B6FD4" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-gray-200 font-semibold text-sm">Preparando visor 3D…</p>
          <p className="text-gray-500 text-xs mt-1">Comprobando Ballchasing</p>
        </div>
      </div>
    </div>
  )

  // ── Estado: Ballchasing listo ─────────────────────────────────────────────
  if (viewerState === 'bc_ready') return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#04090F' }}>
      <TopBar />
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-8">
        {/* Icono de éxito */}
        <div className="w-20 h-20 rounded-full flex items-center justify-center"
             style={{ background: '#0D2240', border: '2px solid #2B6FD455' }}>
          <BcIcon size={36} color="#90C8FF" />
        </div>

        <div className="text-center">
          <p className="text-gray-100 font-display font-bold text-lg tracking-wide mb-1">
            Replay disponible en Ballchasing
          </p>
          <p className="text-gray-500 text-sm">
            {bcStatus === 'cached' ? 'Subido anteriormente · cargando desde caché' : 'Subido correctamente'}
          </p>
        </div>

        {/* Botón principal */}
        <button
          onClick={() => window.open(bcUrl, '_blank')}
          className="flex items-center gap-3 px-8 py-4 rounded-xl font-semibold text-base transition-all hover:scale-[1.03]"
          style={{
            background: 'linear-gradient(135deg, #1A3F80, #0E2850)',
            border: '1px solid #3A8EFF55',
            color: '#90C8FF',
            boxShadow: '0 0 32px #2B6FD422',
          }}>
          <BcIcon size={20} color="#90C8FF" />
          Ver en Ballchasing
          <span className="text-lg opacity-70">↗</span>
        </button>

        <p className="text-gray-600 text-xs text-center max-w-xs">
          Se abrirá el visor 3D oficial de ballchasing.com en tu navegador.
        </p>

        {/* Fallback discreto */}
        <button
          onClick={() => setViewerState('our_viewer')}
          className="text-gray-600 hover:text-gray-400 text-xs transition-colors"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          Usar visor propio de RLAnalyzer →
        </button>
      </div>
    </div>
  )

  // ── Estado: Ballchasing no disponible ────────────────────────────────────
  if (viewerState === 'bc_failed') return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#04090F' }}>
      <TopBar />
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-8">
        {/* Icono de aviso */}
        <div className="w-20 h-20 rounded-full flex items-center justify-center"
             style={{ background: '#1A0D0D', border: '2px solid #FF474722' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#FF7A7A" strokeWidth="1.5">
            <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
        </div>

        <div className="text-center max-w-sm">
          <p className="text-gray-200 font-display font-bold text-base tracking-wide mb-3">
            Ballchasing no disponible
          </p>
          {/* Motivo */}
          <div className="rounded-xl px-4 py-3 text-left"
               style={{ background: '#07111E', border: '1px solid #1A3A5C' }}>
            {(BC_REASON[bcStatus] || bcError || 'Error desconocido').split('\n').map((line, i) => (
              <p key={i} className={i === 0 ? 'text-gray-300 text-sm font-medium' : 'text-gray-500 text-xs mt-1'}>
                {line}
              </p>
            ))}
          </div>
        </div>

        {/* Botón continuar */}
        <button
          onClick={() => setViewerState('our_viewer')}
          className="flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all hover:scale-[1.03]"
          style={{
            background: 'linear-gradient(135deg, #0D2240, #071829)',
            border: '1px solid #1A3A5C',
            color: '#7AADD4',
            boxShadow: '0 0 20px #00000044',
          }}>
          Continuar con visor propio
          <span>→</span>
        </button>
      </div>
    </div>
  )

  // ── Estado: visor propio ──────────────────────────────────────────────────
  const team0        = (frames?.players || []).filter(p => p.team === 0)
  const team1        = (frames?.players || []).filter(p => p.team === 1)
  const goalMarkers  = frames?.goals || []
  const safeDuration = duration || 1

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#04090F' }}>

      {/* ── Barra superior ────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-1.5"
           style={{ background: '#030810', borderBottom: '1px solid #0A1E35' }}>

        <button onClick={() => navigate(-1)}
          className="text-gray-500 hover:text-gray-300 text-sm transition-colors flex items-center gap-1"
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

        {/* Volver a Ballchasing si estaba disponible */}
        {bcUrl && (
          <button onClick={() => window.open(bcUrl, '_blank')}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all hover:opacity-90 flex-shrink-0"
            style={{ background: '#0D2240', border: '1px solid #2B6FD455', color: '#6AAEFF' }}
            title="Ver en Ballchasing">
            <BcIcon size={11} color="#6AAEFF" /> Ballchasing ↗
          </button>
        )}

        {/* Velocidad */}
        <div className="flex items-center gap-1 flex-shrink-0">
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

      {/* ── Zona central ────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Panel azul */}
        <div className="flex-shrink-0 w-36 flex flex-col gap-1.5 p-2.5 overflow-y-auto"
             style={{ background: '#030810', borderRight: '1px solid #0A1E35' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: TEAM_COLOR[0] }}>Equipo Azul</p>
          {team0.map((p, i) => <PlayerCard key={i} player={p} team={0} />)}
        </div>

        {/* Canvas / loading / error */}
        <div className="flex-1 relative overflow-hidden" style={{ background: '#04090F' }}>
          {framesErr ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <p className="text-red-400 text-sm font-semibold">⚠ Error cargando frames</p>
              <p className="text-gray-500 text-xs max-w-sm text-center font-mono">{framesErr}</p>
            </div>
          ) : !frames ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-t-rl-blue border-bg-tertiary animate-spin" />
              <p className="text-gray-400 text-sm">{framesMsg}</p>
            </div>
          ) : (
            <Viewer3D
              frames={frames}
              playing={playing}
              speed={speed}
              currentT={currentT}
              onTimeUpdate={handleTimeUpdate}
              labelRefs={labelRefs}
            />
          )}

          {/* Etiquetas HTML sobre coches */}
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

// ── Icono Ballchasing (balón de RL) ───────────────────────────────────────────
function BcIcon({ size = 14, color = '#5888B4' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.4">
      <circle cx="8" cy="8" r="6.5"/>
      <ellipse cx="8" cy="8" rx="3" ry="6.5"/>
      <line x1="1.5" y1="8" x2="14.5" y2="8"/>
    </svg>
  )
}

// ── Tarjeta lateral de jugador ────────────────────────────────────────────────
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
