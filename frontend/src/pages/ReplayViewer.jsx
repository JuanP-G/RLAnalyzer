/**
 * ReplayViewer.jsx — Visor 3D estilo ballchasing.com
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { api } from '../api'
import { getMapName } from '../utils/mapNames'

const S = 0.01  // UU → Three.js

const TEAM_COLOR   = ['#3A8EFF', '#FF7A00']
const TEAM_HEX     = [0x3A8EFF, 0xFF7A00]
const TEAM_FIELD   = [0x1A3F80, 0x7A3800]  // colores mitad campo
const TEAM_WALL    = [0x0D2A5C, 0x5C2A0D]  // paredes más saturadas

const FIELD = {
  halfLen: 5120 * S,
  halfWid: 4096 * S,
  wallH:   2044 * S,
  goalW:    893 * S,
  goalH:    642 * S,
  goalD:    880 * S,
  ballR:     91 * S,
  carL:     118 * S,
  carW:      82 * S,
  carH:      32 * S,
}

const BIG_BOOSTS = [
  [-3072, -4096], [3072, -4096],
  [-3584,     0], [3584,     0],
  [-3072,  4096], [3072,  4096],
]

// ── Helpers de geometría ──────────────────────────────────────────────────────

function makeLine(points, mat) {
  const geo = new THREE.BufferGeometry()
  geo.setFromPoints(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)))
  return new THREE.Line(geo, mat)
}

function makeCircle(cx, cy, cz, r, segments, mat) {
  const pts = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz))
  }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat)
}

function _quat_to_yaw(rot) {
  const x = rot.x || 0, y = rot.y || 0, z = rot.z || 0, w = rot.w || 0
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
}

// ── Construcción de escena ────────────────────────────────────────────────────

function buildScene(renderer, players) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x06111E)
  scene.fog = new THREE.Fog(0x06111E, 100, 220)

  // Cámara isométrica — vista desde esquina del lado azul (y negativo)
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500)
  camera.position.set(-35, -88, 72)
  camera.lookAt(0, 12, 0)

  // Luces
  scene.add(new THREE.AmbientLight(0x334466, 1.6))
  const sun = new THREE.DirectionalLight(0xffffff, 1.8)
  sun.position.set(30, -40, 80)
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0x4466AA, 0.5)
  fill.position.set(-30, 40, 20)
  scene.add(fill)

  // ── Campo bicolor ─────────────────────────────────────────────────────────
  // Mitad azul (y < 0, equipo 0)
  const blueFloorGeo = new THREE.PlaneGeometry(FIELD.halfWid * 2, FIELD.halfLen)
  const blueFloorMat = new THREE.MeshStandardMaterial({ color: TEAM_FIELD[0], roughness: 0.9 })
  const blueFloor = new THREE.Mesh(blueFloorGeo, blueFloorMat)
  blueFloor.rotation.x = -Math.PI / 2
  blueFloor.position.y = -FIELD.halfLen / 2
  scene.add(blueFloor)

  // Mitad naranja (y > 0, equipo 1)
  const orangeFloorGeo = new THREE.PlaneGeometry(FIELD.halfWid * 2, FIELD.halfLen)
  const orangeFloorMat = new THREE.MeshStandardMaterial({ color: TEAM_FIELD[1], roughness: 0.9 })
  const orangeFloor = new THREE.Mesh(orangeFloorGeo, orangeFloorMat)
  orangeFloor.rotation.x = -Math.PI / 2
  orangeFloor.position.y = FIELD.halfLen / 2
  scene.add(orangeFloor)

  // ── Líneas del campo (blancas sobre el campo) ─────────────────────────────
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.55, transparent: true })

  // Línea central
  scene.add(makeLine([
    [-FIELD.halfWid, 0, 0.02],
    [ FIELD.halfWid, 0, 0.02],
  ], lineMat))

  // Contorno
  const corners = [
    [-FIELD.halfWid, -FIELD.halfLen, 0.02],
    [ FIELD.halfWid, -FIELD.halfLen, 0.02],
    [ FIELD.halfWid,  FIELD.halfLen, 0.02],
    [-FIELD.halfWid,  FIELD.halfLen, 0.02],
    [-FIELD.halfWid, -FIELD.halfLen, 0.02],
  ]
  scene.add(makeLine(corners, lineMat))

  // Círculo central
  scene.add(makeCircle(0, 0, 0.02, FIELD.halfWid * 0.28, 48, lineMat))

  // ── Paredes ───────────────────────────────────────────────────────────────
  // Pared lateral izquierda
  const sideWallMat = new THREE.MeshStandardMaterial({
    color: 0x0A1A2E, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
  })
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD.halfLen * 2, FIELD.wallH), sideWallMat
    )
    w.position.set(sx * FIELD.halfWid, 0, FIELD.wallH / 2)
    w.rotation.y = Math.PI / 2
    scene.add(w)
  }

  // Pared fondo azul (sy = -1)
  const blueWallMat = new THREE.MeshStandardMaterial({
    color: TEAM_WALL[0], transparent: true, opacity: 0.65, side: THREE.DoubleSide,
  })
  const orangeWallMat = new THREE.MeshStandardMaterial({
    color: TEAM_WALL[1], transparent: true, opacity: 0.65, side: THREE.DoubleSide,
  })

  for (const [sy, mat] of [[-1, blueWallMat], [1, orangeWallMat]]) {
    const w = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD.halfWid * 2, FIELD.wallH), mat
    )
    w.position.set(0, sy * FIELD.halfLen, FIELD.wallH / 2)
    scene.add(w)
  }

  // Techo (muy transparente)
  const ceilMat = new THREE.MeshBasicMaterial({ color: 0x0A1A2E, transparent: true, opacity: 0.08, side: THREE.DoubleSide })
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.halfWid * 2, FIELD.halfLen * 2), ceilMat)
  ceil.rotation.x = Math.PI / 2
  ceil.position.y = 0
  ceil.position.z = FIELD.wallH
  scene.add(ceil)

  // ── Porterías ─────────────────────────────────────────────────────────────
  for (const [sy, teamIdx] of [[-1, 0], [1, 1]]) {
    const color = new THREE.Color(TEAM_HEX[teamIdx])
    const goalMat = new THREE.LineBasicMaterial({ color, linewidth: 2 })
    const gy = sy * FIELD.halfLen
    scene.add(makeLine([
      [-FIELD.goalW, gy, 0.02],
      [-FIELD.goalW, gy, FIELD.goalH],
      [ FIELD.goalW, gy, FIELD.goalH],
      [ FIELD.goalW, gy, 0.02],
      [-FIELD.goalW, gy, 0.02],
    ], goalMat))
    // Barra horizontal superior
    scene.add(makeLine([
      [-FIELD.goalW, gy, FIELD.goalH],
      [ FIELD.goalW, gy, FIELD.goalH],
    ], goalMat))
    // Fondo semitransparente
    const bgMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD.goalW * 2, FIELD.goalH),
      new THREE.MeshStandardMaterial({
        color: color.clone().multiplyScalar(0.18),
        transparent: true, opacity: 0.5, side: THREE.DoubleSide,
      })
    )
    bgMesh.position.set(0, sy * (FIELD.halfLen + FIELD.goalD / 2), FIELD.goalH / 2)
    scene.add(bgMesh)
  }

  // ── Boost pads grandes ────────────────────────────────────────────────────
  const boostGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.12, 16)
  const boostMat = new THREE.MeshStandardMaterial({ color: 0xFFBB00, emissive: 0x443300 })
  for (const [bx, by] of BIG_BOOSTS) {
    const b = new THREE.Mesh(boostGeo, boostMat)
    b.position.set(bx * S, by * S, 0.06)
    scene.add(b)
  }

  // ── Balón ─────────────────────────────────────────────────────────────────
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(FIELD.ballR, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x333333, roughness: 0.25, metalness: 0.3 })
  )
  ball.position.set(0, 0, FIELD.ballR)
  scene.add(ball)

  const ballShadow = new THREE.Mesh(
    new THREE.CircleGeometry(FIELD.ballR * 1.3, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 })
  )
  ballShadow.rotation.x = -Math.PI / 2
  ballShadow.position.y = 0.005
  scene.add(ballShadow)

  // Anillos de explosión de gol
  const goalRingMat = new THREE.MeshBasicMaterial({ color: 0xFFDD44, transparent: true, opacity: 0 })
  const goalRing = new THREE.Mesh(
    new THREE.TorusGeometry(FIELD.ballR * 1.5, FIELD.ballR * 0.18, 8, 32), goalRingMat
  )
  goalRing.rotation.x = Math.PI / 2
  scene.add(goalRing)
  const goalRing2 = goalRing.clone()
  goalRing2.material = goalRingMat.clone()
  scene.add(goalRing2)

  // ── Coches ────────────────────────────────────────────────────────────────
  const carMeshes = []
  for (let i = 0; i < players.length; i++) {
    const p     = players[i]
    const team  = p.team ?? (i % 2)
    const color = new THREE.Color(TEAM_HEX[team])

    const group = new THREE.Group()

    // Carrocería
    const bodyMat = new THREE.MeshStandardMaterial({
      color,
      emissive: new THREE.Color(team === 0 ? 0x0A2060 : 0x602000),
      roughness: 0.35, metalness: 0.7,
    })
    const body = new THREE.Mesh(new THREE.BoxGeometry(FIELD.carW, FIELD.carL, FIELD.carH * 0.72), bodyMat)
    body.position.z = FIELD.carH * 0.36
    group.add(body)

    // Capó inclinado
    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(FIELD.carW * 0.85, FIELD.carL * 0.42, FIELD.carH * 0.4),
      bodyMat.clone()
    )
    hood.position.set(0, FIELD.carL * 0.1, FIELD.carH * 0.82)
    hood.rotation.x = -0.2
    group.add(hood)

    // Ruedas
    const wheelGeo = new THREE.CylinderGeometry(FIELD.carH * 0.36, FIELD.carH * 0.36, FIELD.carW * 0.11, 10)
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 })
    const wx = FIELD.carW * 0.52, wy = FIELD.carL * 0.36
    for (const [dwx, dwy] of [[-wx, -wy], [wx, -wy], [-wx, wy], [wx, wy]]) {
      const wh = new THREE.Mesh(wheelGeo, wheelMat)
      wh.rotation.z = Math.PI / 2
      wh.position.set(dwx, dwy, FIELD.carH * 0.18)
      group.add(wh)
    }

    group.position.set(0, 0, -100)
    group.userData = { team }
    scene.add(group)
    carMeshes.push(group)
  }

  return { scene, camera, ball, ballShadow, carMeshes, goalRing, goalRing2 }
}

// ── Interpolación de frames ───────────────────────────────────────────────────

function getBallAtTime(ballFrames, t) {
  if (!ballFrames?.length) return null
  let lo = 0, hi = ballFrames.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (ballFrames[mid][0] <= t) lo = mid; else hi = mid
  }
  const a = ballFrames[lo], b = ballFrames[Math.min(lo + 1, hi)]
  if (!b || a[0] === b[0]) return { x: a[1], y: a[2], z: a[3] }
  const f = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])))
  return { x: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f, z: a[3] + (b[3] - a[3]) * f }
}

function getCarsAtTime(carFrames, nPlayers, t) {
  const result = {}
  for (let i = carFrames.length - 1; i >= 0; i--) {
    const [ft, idx, x, y, z, yaw] = carFrames[i]
    if (ft > t) continue
    if (result[idx] === undefined) result[idx] = { x, y, z, yaw }
    if (Object.keys(result).length >= nPlayers) break
  }
  return result
}

function fmt(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ReplayViewer() {
  const { id } = useParams()

  const [replay,  setReplay]  = useState(null)
  const [frames,  setFrames]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [loadMsg, setLoadMsg] = useState('Cargando datos…')
  const [playing, setPlaying] = useState(false)
  const [currentT, setCurrentT] = useState(0)
  const [speed,   setSpeed]   = useState(1)
  const [duration, setDuration] = useState(0)

  const canvasRef    = useRef(null)
  const containerRef = useRef(null)
  const sceneRef     = useRef(null)
  const rafRef       = useRef(null)
  const lastTimeRef  = useRef(null)
  const playingRef   = useRef(false)
  const currentTRef  = useRef(0)
  const speedRef     = useRef(1)
  const framesRef    = useRef(null)
  const labelRefs    = useRef([])  // refs a los divs de etiqueta de cada coche

  // Carga de datos
  useEffect(() => {
    let alive = true
    async function load() {
      try {
        setLoadMsg('Cargando detalles del replay…')
        const r = await api.replay(id)
        if (!alive) return
        setReplay(r)
        setLoadMsg('Procesando frames (puede tardar ~15-30s la primera vez)…')
        const f = await api.replayFrames(id)
        if (!alive) return
        setFrames(f)
        framesRef.current = f
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

  // Inicializar Three.js
  useEffect(() => {
    if (!frames || !canvasRef.current) return

    const canvas   = canvasRef.current
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    const { scene, camera, ball, ballShadow, carMeshes, goalRing, goalRing2 } =
      buildScene(renderer, frames.players || [])

    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping  = true
    controls.dampingFactor  = 0.08
    controls.minDistance    = 15
    controls.maxDistance    = 200
    controls.maxPolarAngle  = Math.PI * 0.5
    controls.target.set(0, 5, 0)

    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    sceneRef.current = { renderer, scene, camera, controls, ball, ballShadow, carMeshes, goalRing, goalRing2 }

    const CELEBRATION = 3.5

    function animate(now) {
      rafRef.current = requestAnimationFrame(animate)

      if (playingRef.current && lastTimeRef.current != null) {
        const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05)
        currentTRef.current = Math.min(
          currentTRef.current + dt * speedRef.current,
          framesRef.current?.duration || 0
        )
        if (currentTRef.current >= (framesRef.current?.duration || 0)) {
          playingRef.current = false
          setPlaying(false)
        }
        setCurrentT(currentTRef.current)
      }
      lastTimeRef.current = now

      const t   = currentTRef.current
      const frd = framesRef.current
      if (frd) {
        const activeGoal = (frd.goals || []).find(
          g => t >= g.time && t < g.time + CELEBRATION
        )

        // Balón
        const bp = getBallAtTime(frd.ball, t)
        if (bp) {
          ball.position.set(bp.x * S, bp.y * S, bp.z * S)
          ballShadow.position.set(bp.x * S, bp.y * S, 0.005)
        }

        // Efecto de gol
        if (activeGoal) {
          const phase    = Math.min((t - activeGoal.time) / CELEBRATION, 1)
          const teamHex  = TEAM_HEX[activeGoal.team ?? 0]
          goalRing.scale.setScalar(1 + phase * 6)
          goalRing.position.copy(ball.position)
          goalRing.material.color.set(teamHex)
          goalRing.material.opacity = Math.max(0, 0.9 - phase * 1.1)
          const p2 = Math.max(0, phase - 0.15)
          goalRing2.scale.setScalar(1 + p2 * 4)
          goalRing2.position.copy(ball.position)
          goalRing2.material.color.set(0xffffff)
          goalRing2.material.opacity = Math.max(0, 0.7 - p2 * 1.4)
          ball.scale.setScalar(1 + Math.sin(phase * Math.PI) * 1.8)
          ball.material.emissive.set(teamHex)
          ball.material.emissiveIntensity = 1 - phase
        } else {
          goalRing.material.opacity  = 0
          goalRing2.material.opacity = 0
          ball.scale.setScalar(1)
          ball.material.emissive.set(0x333333)
          ball.material.emissiveIntensity = 1
        }

        // Coches + etiquetas HTML
        const cp = getCarsAtTime(frd.cars, frd.players?.length || 0, t)
        carMeshes.forEach((mesh, idx) => {
          const pos  = cp[idx]
          const labelEl = labelRefs.current[idx]
          if (!pos) {
            if (labelEl) labelEl.style.display = 'none'
            return
          }
          const ax = Math.abs(pos.x * S), ay = Math.abs(pos.y * S)
          const inBounds = ax < FIELD.halfWid * 1.6 && ay < FIELD.halfLen * 1.6
          if (inBounds) {
            mesh.position.set(pos.x * S, pos.y * S, pos.z * S)
            mesh.rotation.z = pos.yaw
            mesh.visible = true

            // Proyectar posición 3D a coordenadas de pantalla para la etiqueta
            if (labelEl && containerRef.current) {
              const screenPos = new THREE.Vector3(
                pos.x * S, pos.y * S, pos.z * S + FIELD.carH + 0.8
              ).project(camera)
              const cw = canvas.clientWidth, ch = canvas.clientHeight
              const sx = (screenPos.x + 1) / 2 * cw
              const sy = (-screenPos.y + 1) / 2 * ch
              if (screenPos.z < 1) {
                labelEl.style.display = 'block'
                labelEl.style.left    = sx + 'px'
                labelEl.style.top     = sy + 'px'
              } else {
                labelEl.style.display = 'none'
              }
            }
          } else {
            mesh.visible = false
            if (labelEl) labelEl.style.display = 'none'
          }
        })
      }

      controls.update()
      renderer.render(scene, camera)
    }
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      sceneRef.current = null
    }
  }, [frames])

  useEffect(() => { playingRef.current = playing }, [playing])
  useEffect(() => { speedRef.current   = speed   }, [speed])

  const togglePlay = useCallback(() => {
    if (currentTRef.current >= duration) {
      currentTRef.current = 0
      setCurrentT(0)
    }
    setPlaying(p => !p)
  }, [duration])

  const seekTo = useCallback(t => {
    currentTRef.current = t
    setCurrentT(t)
    lastTimeRef.current = null
  }, [])

  // Puntuación en tiempo actual
  const scores = [0, 0]
  if (frames) {
    for (const g of (frames.goals || [])) {
      if (g.time <= currentT) scores[g.team ?? 0]++
    }
  }

  // Jugadores por equipo
  const team0 = (frames?.players || []).filter(p => p.team === 0)
  const team1 = (frames?.players || []).filter(p => p.team === 1)

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="h-full flex flex-col items-center justify-center gap-4" style={{ background: '#06111E' }}>
      <div className="w-8 h-8 rounded-full border-2 border-t-rl-blue border-bg-tertiary animate-spin" />
      <p className="text-gray-400 text-sm">{loadMsg}</p>
    </div>
  )

  if (error) return (
    <div className="h-full flex items-center justify-center px-8" style={{ background: '#06111E' }}>
      <div className="max-w-lg rounded-xl p-6 text-center" style={{ background: '#071829', border: '1px solid #1A3A5C' }}>
        <p className="text-red-400 font-bold uppercase text-sm mb-2">⚠ Error al cargar el visor</p>
        <p className="text-gray-400 text-xs mb-4 font-mono whitespace-pre-wrap text-left max-h-48 overflow-auto">{error}</p>
        <Link to={`/replays/${id}`} className="text-rl-blue text-sm hover:underline">← Volver al detalle</Link>
      </div>
    </div>
  )

  const goalMarkers = frames?.goals || []
  const safeDuration = duration || 1

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#06111E' }}>

      {/* ── Marcador superior ──────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-1.5"
           style={{ background: '#030B14', borderBottom: '1px solid #0A1E35' }}>

        {/* Volver */}
        <Link to={`/replays/${id}`}
          className="text-gray-500 hover:text-gray-300 text-sm transition-colors flex items-center gap-1.5">
          ← {replay ? getMapName(replay.map_name) : '—'}
        </Link>

        {/* Marcador central */}
        <div className="flex items-center gap-0 rounded-lg overflow-hidden"
             style={{ border: '1px solid #1A3A5C' }}>
          <div className="px-4 py-1 text-lg font-bold font-display text-white"
               style={{ background: '#1A3F80', minWidth: 48, textAlign: 'center' }}>
            {scores[0]}
          </div>
          <div className="px-4 py-1 text-sm font-mono-num text-gray-300"
               style={{ background: '#0A1A2E', minWidth: 72, textAlign: 'center' }}>
            {fmt(currentT)}
          </div>
          <div className="px-4 py-1 text-lg font-bold font-display text-white"
               style={{ background: '#7A3800', minWidth: 48, textAlign: 'center' }}>
            {scores[1]}
          </div>
        </div>

        {/* Velocidad */}
        <div className="flex items-center gap-1">
          {[0.5, 1, 2, 4].map(v => (
            <button key={v} onClick={() => setSpeed(v)}
              className="px-2 py-0.5 rounded text-xs font-display font-semibold transition-all"
              style={{
                background: speed === v ? '#00A8FF22' : '#0D2240',
                color:      speed === v ? '#00A8FF'   : '#5888B4',
                border:     `1px solid ${speed === v ? '#00A8FF55' : '#1A3A5C'}`,
              }}>
              {v}×
            </button>
          ))}
        </div>
      </div>

      {/* ── Área central: paneles + canvas ────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative" ref={containerRef}>

        {/* Panel equipo 0 (azul, izquierda) */}
        <div className="flex-shrink-0 w-36 flex flex-col gap-1 p-2 overflow-y-auto"
             style={{ background: '#030B14', borderRight: '1px solid #0A1E35' }}>
          <p className="text-xs text-blue-400 font-bold uppercase tracking-wider mb-1"
             style={{ color: TEAM_COLOR[0] }}>Equipo Azul</p>
          {team0.map((p, i) => (
            <PlayerCard key={i} player={p} team={0} />
          ))}
        </div>

        {/* Canvas + etiquetas HTML */}
        <div className="flex-1 relative overflow-hidden">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full"
                  style={{ display: 'block', touchAction: 'none' }} />

          {/* Etiquetas de jugadores sobre los coches */}
          {(frames?.players || []).map((p, i) => (
            <div key={i}
              ref={el => { labelRefs.current[i] = el }}
              className="absolute pointer-events-none"
              style={{
                display: 'none',
                transform: 'translate(-50%, -100%)',
                zIndex: 10,
              }}>
              <div className="px-1.5 py-0.5 rounded text-xs font-semibold text-white whitespace-nowrap"
                   style={{
                     background: (p.team === 0 ? '#1A3F80' : '#7A3800') + 'CC',
                     border: `1px solid ${TEAM_COLOR[p.team ?? 0]}66`,
                     backdropFilter: 'blur(4px)',
                   }}>
                {p.name}
              </div>
            </div>
          ))}
        </div>

        {/* Panel equipo 1 (naranja, derecha) */}
        <div className="flex-shrink-0 w-36 flex flex-col gap-1 p-2 overflow-y-auto"
             style={{ background: '#030B14', borderLeft: '1px solid #0A1E35' }}>
          <p className="text-xs font-bold uppercase tracking-wider mb-1 text-right"
             style={{ color: TEAM_COLOR[1] }}>Equipo Naranja</p>
          {team1.map((p, i) => (
            <PlayerCard key={i} player={p} team={1} />
          ))}
        </div>
      </div>

      {/* ── Timeline inferior ─────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 py-2"
           style={{ background: '#030B14', borderTop: '1px solid #0A1E35' }}>

        {/* Barra de progreso con marcadores de gol */}
        <div className="relative mb-2" style={{ height: 20 }}>
          {goalMarkers.map((g, i) => {
            const pct = (g.time / safeDuration) * 100
            const isNear = Math.abs(currentT - g.time) < 3.5
            return (
              <button key={i} onClick={() => seekTo(Math.max(0, g.time - 1.5))}
                className="absolute top-0 h-full flex flex-col items-center justify-center"
                style={{ left: `${pct}%`, transform: 'translateX(-50%)', zIndex: 2 }}>
                <div style={{
                  width: 3,
                  height: '100%',
                  background: TEAM_COLOR[g.team ?? 0],
                  boxShadow: `0 0 6px ${TEAM_COLOR[g.team ?? 0]}`,
                  borderRadius: 2,
                  opacity: isNear ? 1 : 0.7,
                }} />
              </button>
            )
          })}
          <input type="range" min={0} max={safeDuration} step={0.1} value={currentT}
            onChange={e => seekTo(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer absolute bottom-0"
            style={{
              background: `linear-gradient(to right, ${TEAM_COLOR[0]} ${(currentT / safeDuration) * 100}%, #0D2240 0%)`,
            }} />
        </div>

        {/* Controles */}
        <div className="flex items-center gap-3">
          <button onClick={togglePlay}
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
            style={{ background: '#00A8FF22', border: '1px solid #00A8FF55' }}>
            {playing ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="#00A8FF">
                <rect x="0" y="0" width="3.5" height="10" rx="1"/>
                <rect x="6.5" y="0" width="3.5" height="10" rx="1"/>
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="#00A8FF">
                <polygon points="1,0 10,5 1,10"/>
              </svg>
            )}
          </button>
          <span className="font-mono-num text-sm text-gray-400 flex-shrink-0">
            {fmt(currentT)} <span className="text-gray-600">/</span> {fmt(safeDuration)}
          </span>
          <div className="flex-1" />
          {/* Leyenda de goles */}
          <div className="flex gap-2 text-xs text-gray-500">
            {goalMarkers.map((g, i) => (
              <button key={i} onClick={() => seekTo(Math.max(0, g.time - 1.5))}
                className="flex items-center gap-1 hover:text-white transition-colors">
                <span className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: TEAM_COLOR[g.team ?? 0] }} />
                {fmt(g.time)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tarjeta de jugador (panel lateral) ────────────────────────────────────────

function PlayerCard({ player, team }) {
  return (
    <div className="rounded-lg px-2 py-1.5"
         style={{
           background: '#0A1525',
           border: `1px solid ${TEAM_COLOR[team]}30`,
         }}>
      <p className="text-xs font-semibold text-white truncate">{player.name}</p>
      {/* Barra de boost (placeholder) */}
      <div className="mt-1 flex items-center gap-1.5">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#1A2A3A' }}>
          <div className="h-full rounded-full"
               style={{ width: '33%', background: '#FFB800' }} />
        </div>
        <span className="text-xs text-gray-500 font-mono-num">33</span>
      </div>
    </div>
  )
}
