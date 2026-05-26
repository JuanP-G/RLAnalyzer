/**
 * ReplayViewer.jsx — Visor 3D estilo ballchasing.com
 * Renderiza posición + rotación completa (quaternion) de coches y balón.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { api } from '../api'
import { getMapName } from '../utils/mapNames'

// ── Constantes de escala y campo ──────────────────────────────────────────────
const S = 0.01   // Unreal Units → Three.js

const TEAM_COLOR = ['#3A8EFF', '#FF7A00']
const TEAM_HEX   = [0x2B6FD4, 0xD46B2B]

const F = {
  hx:    4096 * S,   // half width
  hy:    5120 * S,   // half length
  wallH: 2044 * S,
  goalW:  893 * S,
  goalH:  642 * S,
  goalD:  880 * S,
  ballR:   91 * S,
  carW:   118 * S,   // width  (X en local del coche)
  carL:    84 * S,   // length (Y en local del coche)
  carH:    36 * S,   // height (Z en local del coche)
  cut:   1820 * S,   // corte de esquina octagonal
}

const BIG_BOOSTS = [
  [-3072, -4096], [3072, -4096],
  [-3584,     0], [3584,     0],
  [-3072,  4096], [3072,  4096],
]

// ── Helpers de geometría ──────────────────────────────────────────────────────
function makeLineFromPoints(pts, color, opacity = 1) {
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  const mat = new THREE.LineBasicMaterial({ color, opacity, transparent: opacity < 1 })
  return new THREE.Line(geo, mat)
}

function makeOctPoints(z = 0) {
  const { hx, hy, cut } = F
  return [
    new THREE.Vector3(-hx + cut, -hy, z),
    new THREE.Vector3( hx - cut, -hy, z),
    new THREE.Vector3( hx,       -hy + cut, z),
    new THREE.Vector3( hx,        hy - cut, z),
    new THREE.Vector3( hx - cut,  hy, z),
    new THREE.Vector3(-hx + cut,  hy, z),
    new THREE.Vector3(-hx,        hy - cut, z),
    new THREE.Vector3(-hx,       -hy + cut, z),
    new THREE.Vector3(-hx + cut, -hy, z),  // close
  ]
}

function makeCirclePoints(cx, cy, cz, r, seg = 48) {
  const pts = []
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2
    pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz))
  }
  return pts
}

// ── Construcción de escena ────────────────────────────────────────────────────
function buildScene(players) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x04090F)

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 500)
  camera.position.set(-28, -90, 70)
  camera.lookAt(0, 8, 0)

  // Luces
  scene.add(new THREE.AmbientLight(0x445566, 1.8))
  const sun = new THREE.DirectionalLight(0xffffff, 2.0)
  sun.position.set(20, -50, 80)
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0x3366AA, 0.6)
  fill.position.set(-20, 40, 30)
  scene.add(fill)

  // ── Campo bicolor ─────────────────────────────────────────────────────────
  const blueFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(F.hx * 2, F.hy),
    new THREE.MeshLambertMaterial({ color: 0x152B4A }),
  )
  blueFloor.rotation.x = -Math.PI / 2
  blueFloor.position.y = -F.hy / 2
  scene.add(blueFloor)

  const orangeFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(F.hx * 2, F.hy),
    new THREE.MeshLambertMaterial({ color: 0x3D1E08 }),
  )
  orangeFloor.rotation.x = -Math.PI / 2
  orangeFloor.position.y = F.hy / 2
  scene.add(orangeFloor)

  // ── Líneas ────────────────────────────────────────────────────────────────
  const lineW = 0xffffff, lineO = 0.45

  // Contorno octagonal
  scene.add(makeLineFromPoints(makeOctPoints(0.02), lineW, lineO))

  // Línea de medio campo
  scene.add(makeLineFromPoints([
    new THREE.Vector3(-F.hx, 0, 0.02),
    new THREE.Vector3( F.hx, 0, 0.02),
  ], lineW, lineO))

  // Círculo central
  scene.add(makeLineFromPoints(
    makeCirclePoints(0, 0, 0.02, F.hx * 0.28),
    lineW, lineO
  ))

  // Semicírculos de portería
  for (const sy of [-1, 1]) {
    scene.add(makeLineFromPoints(
      makeCirclePoints(0, sy * F.hy * 0.77, 0.02, F.hx * 0.18, 24),
      lineW, lineO * 0.7
    ))
  }

  // ── Porterías ─────────────────────────────────────────────────────────────
  for (const [sy, ti] of [[-1, 0], [1, 1]]) {
    const col = TEAM_HEX[ti]
    const gy  = sy * F.hy
    const pts = [
      new THREE.Vector3(-F.goalW, gy, 0.02),
      new THREE.Vector3(-F.goalW, gy, F.goalH),
      new THREE.Vector3( F.goalW, gy, F.goalH),
      new THREE.Vector3( F.goalW, gy, 0.02),
      new THREE.Vector3(-F.goalW, gy, 0.02),
    ]
    scene.add(makeLineFromPoints(pts, col, 0.9))
    // Barras verticales del poste
    scene.add(makeLineFromPoints([
      new THREE.Vector3(-F.goalW, gy, 0.02),
      new THREE.Vector3(-F.goalW, gy, F.goalH),
    ], col, 0.9))
    scene.add(makeLineFromPoints([
      new THREE.Vector3( F.goalW, gy, 0.02),
      new THREE.Vector3( F.goalW, gy, F.goalH),
    ], col, 0.9))
    // Fondo translúcido
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(F.goalW * 2, F.goalH),
      new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.12, side: THREE.DoubleSide,
      })
    )
    bg.position.set(0, sy * (F.hy + F.goalD / 2), F.goalH / 2)
    scene.add(bg)
  }

  // ── Paredes laterales (muy sutiles) ──────────────────────────────────────
  const wallMat = new THREE.MeshBasicMaterial({
    color: 0x0A1525, transparent: true, opacity: 0.2, side: THREE.DoubleSide,
  })
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(F.hy * 2, F.wallH), wallMat)
    w.position.set(sx * F.hx, 0, F.wallH / 2)
    w.rotation.y = Math.PI / 2
    scene.add(w)
  }
  for (const sy of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(F.hx * 2, F.wallH), wallMat)
    w.position.set(0, sy * F.hy, F.wallH / 2)
    scene.add(w)
  }

  // ── Big boost pads ────────────────────────────────────────────────────────
  const boostGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.1, 16)
  const boostMat = new THREE.MeshStandardMaterial({ color: 0xFFBB00, emissive: 0x664400, roughness: 0.4 })
  for (const [bx, by] of BIG_BOOSTS) {
    const b = new THREE.Mesh(boostGeo, boostMat)
    b.rotation.x = -Math.PI / 2
    b.position.set(bx * S, by * S, 0.05)
    scene.add(b)
  }

  // ── Balón ─────────────────────────────────────────────────────────────────
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(F.ballR, 28, 20),
    new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0x222222, roughness: 0.2, metalness: 0.15,
    })
  )
  ball.position.set(0, 0, F.ballR)
  scene.add(ball)

  const ballShadow = new THREE.Mesh(
    new THREE.CircleGeometry(F.ballR * 1.5, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })
  )
  ballShadow.rotation.x = -Math.PI / 2
  ballShadow.position.z = 0.008
  scene.add(ballShadow)

  // Anillo de gol
  const goalRingMat = new THREE.MeshBasicMaterial({ color: 0xFFDD44, transparent: true, opacity: 0 })
  const goalRing = new THREE.Mesh(
    new THREE.TorusGeometry(F.ballR * 1.6, F.ballR * 0.2, 8, 32), goalRingMat
  )
  goalRing.rotation.x = Math.PI / 2
  scene.add(goalRing)
  const goalRing2 = goalRing.clone()
  goalRing2.material = goalRingMat.clone()
  scene.add(goalRing2)

  // ── Coches ────────────────────────────────────────────────────────────────
  const carMeshes  = []
  const carShadows = []

  for (let i = 0; i < players.length; i++) {
    const team     = players[i].team ?? (i % 2)
    const teamCol  = new THREE.Color(TEAM_HEX[team])
    const emissCol = teamCol.clone().multiplyScalar(0.18)

    const group = new THREE.Group()

    // Cuerpo principal — caja ligeramente aplanada
    const bodyMat = new THREE.MeshStandardMaterial({
      color: teamCol, emissive: emissCol, roughness: 0.3, metalness: 0.55,
    })
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(F.carW, F.carL, F.carH * 0.7),
      bodyMat
    )
    group.add(body)

    // Parte superior más estrecha (capota)
    const roofMat = new THREE.MeshStandardMaterial({
      color: teamCol.clone().multiplyScalar(1.15), emissive: emissCol, roughness: 0.25, metalness: 0.6,
    })
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(F.carW * 0.7, F.carL * 0.55, F.carH * 0.4),
      roofMat
    )
    roof.position.set(0, 0, F.carH * 0.55)
    group.add(roof)

    // Indicador frontal blanco (muestra qué lado es el frente)
    const frontMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xcccccc, emissiveIntensity: 0.4, roughness: 0.5,
    })
    const front = new THREE.Mesh(
      new THREE.BoxGeometry(F.carW * 0.55, F.carH * 0.12, F.carH * 0.55),
      frontMat
    )
    front.position.set(0, F.carL / 2 + F.carH * 0.06, 0)
    group.add(front)

    group.position.set(0, 0, -200)  // fuera de vista al inicio
    group.userData.team = team
    scene.add(group)
    carMeshes.push(group)

    // Sombra en el suelo (indica posición horizontal cuando el coche vuela)
    const shadowMat = new THREE.MeshBasicMaterial({
      color: TEAM_HEX[team], transparent: true, opacity: 0.2,
    })
    const carShadow = new THREE.Mesh(
      new THREE.CircleGeometry(F.carW * 0.75, 14),
      shadowMat
    )
    carShadow.rotation.x = -Math.PI / 2
    carShadow.position.set(0, 0, 0.01)
    scene.add(carShadow)
    carShadows.push(carShadow)
  }

  return { scene, camera, ball, ballShadow, carMeshes, carShadows, goalRing, goalRing2 }
}

// ── Interpolación ─────────────────────────────────────────────────────────────

function getBallAtTime(frames, t) {
  if (!frames?.length) return null
  let lo = 0, hi = frames.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (frames[mid][0] <= t) lo = mid; else hi = mid
  }
  const a = frames[lo], b = frames[Math.min(lo + 1, hi)]
  if (!b || a[0] === b[0]) return { x: a[1], y: a[2], z: a[3] }
  const f = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])))
  return {
    x: a[1] + (b[1] - a[1]) * f,
    y: a[2] + (b[2] - a[2]) * f,
    z: a[3] + (b[3] - a[3]) * f,
  }
}

// Pre-indexa frames de coches por jugador (una vez al cargar)
function buildCarIndex(carFrames) {
  const idx = {}
  for (const fr of (carFrames || [])) {
    const p = fr[1]
    if (!idx[p]) idx[p] = []
    idx[p].push(fr)
  }
  return idx
}

function getCarAtTime(playerFrames, t) {
  if (!playerFrames?.length) return null
  let lo = 0, hi = playerFrames.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (playerFrames[mid][0] <= t) lo = mid; else hi = mid
  }
  const a = playerFrames[lo]
  const b = playerFrames[Math.min(lo + 1, hi)]
  const hasQuat = a.length >= 9

  if (!b || a[0] === b[0]) {
    const q = hasQuat
      ? new THREE.Quaternion(a[5], a[6], a[7], a[8])
      : new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, a[5]))
    return { x: a[2], y: a[3], z: a[4], q }
  }

  const f = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])))
  let q
  if (hasQuat) {
    const qa = new THREE.Quaternion(a[5], a[6], a[7], a[8])
    const qb = new THREE.Quaternion(b[5], b[6], b[7], b[8])
    qa.slerp(qb, f)
    q = qa
  } else {
    q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, 0, a[5] + (b[5] - a[5]) * f)
    )
  }
  return {
    x: a[2] + (b[2] - a[2]) * f,
    y: a[3] + (b[3] - a[3]) * f,
    z: a[4] + (b[4] - a[4]) * f,
    q,
  }
}

function fmt(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ReplayViewer() {
  const { id }     = useParams()
  const navigate   = useNavigate()

  const [replay,   setReplay]   = useState(null)
  const [frames,   setFrames]   = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [loadMsg,  setLoadMsg]  = useState('Cargando datos…')
  const [error,    setError]    = useState(null)
  const [playing,  setPlaying]  = useState(false)
  const [currentT, setCurrentT] = useState(0)
  const [speed,    setSpeed]    = useState(1)
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
  const carIdxRef    = useRef(null)
  const labelRefs    = useRef([])

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
        framesRef.current  = f
        carIdxRef.current  = buildCarIndex(f.cars)
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

    const { scene, camera, ball, ballShadow, carMeshes, carShadows, goalRing, goalRing2 } =
      buildScene(frames.players || [])

    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping  = true
    controls.dampingFactor  = 0.07
    controls.minDistance    = 10
    controls.maxDistance    = 220
    controls.maxPolarAngle  = Math.PI * 0.52
    controls.target.set(0, 4, 0)

    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    sceneRef.current = { renderer, scene, camera, controls, ball, ballShadow, carMeshes, carShadows, goalRing, goalRing2 }

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
      if (!frd) { controls.update(); renderer.render(scene, camera); return }

      const activeGoal = (frd.goals || []).find(g => t >= g.time && t < g.time + CELEBRATION)

      // Balón
      const bp = getBallAtTime(frd.ball, t)
      if (bp) {
        ball.position.set(bp.x * S, bp.y * S, bp.z * S)
        ballShadow.position.set(bp.x * S, bp.y * S, 0.008)
      }

      // Efecto gol
      if (activeGoal) {
        const phase = Math.min((t - activeGoal.time) / CELEBRATION, 1)
        const hex   = TEAM_HEX[activeGoal.team ?? 0]
        goalRing.scale.setScalar(1 + phase * 7)
        goalRing.position.copy(ball.position)
        goalRing.material.color.set(hex)
        goalRing.material.opacity = Math.max(0, 0.85 - phase * 1.1)
        const p2 = Math.max(0, phase - 0.15)
        goalRing2.scale.setScalar(1 + p2 * 4)
        goalRing2.position.copy(ball.position)
        goalRing2.material.color.set(0xffffff)
        goalRing2.material.opacity = Math.max(0, 0.65 - p2 * 1.3)
        ball.scale.setScalar(1 + Math.sin(phase * Math.PI) * 2)
        ball.material.emissive.set(hex)
        ball.material.emissiveIntensity = 1 - phase
      } else {
        goalRing.material.opacity  = 0
        goalRing2.material.opacity = 0
        ball.scale.setScalar(1)
        ball.material.emissive.set(0x222222)
        ball.material.emissiveIntensity = 1
      }

      // Coches
      const cidx = carIdxRef.current || {}
      carMeshes.forEach((mesh, i) => {
        const pos     = getCarAtTime(cidx[i], t)
        const shadow  = carShadows[i]
        const labelEl = labelRefs.current[i]

        if (!pos) {
          mesh.visible = false
          if (shadow) shadow.visible = false
          if (labelEl) labelEl.style.display = 'none'
          return
        }

        const wx = pos.x * S, wy = pos.y * S, wz = pos.z * S
        const inBounds = Math.abs(wx) < F.hx * 1.7 && Math.abs(wy) < F.hy * 1.7

        if (inBounds) {
          mesh.position.set(wx, wy, wz)
          mesh.quaternion.copy(pos.q)
          mesh.visible = true

          if (shadow) {
            shadow.position.set(wx, wy, 0.01)
            shadow.visible = true
            // Sombra se hace más translúcida cuanto más alto está el coche
            const heightFade = Math.max(0, 1 - wz / (F.wallH * 0.8))
            shadow.material.opacity = 0.25 * heightFade
          }

          // Etiqueta HTML sobre el coche
          if (labelEl && canvasRef.current) {
            const screenPos = new THREE.Vector3(wx, wy, wz + F.carH + 0.9).project(camera)
            const cw = canvas.clientWidth, ch = canvas.clientHeight
            const sx = (screenPos.x  + 1) / 2 * cw
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
          if (shadow)  shadow.visible = false
          if (labelEl) labelEl.style.display = 'none'
        }
      })

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

  // Marcador dinámico
  const scores = useMemo(() => {
    const s = [0, 0]
    if (frames) for (const g of (frames.goals || [])) if (g.time <= currentT) s[g.team ?? 0]++
    return s
  }, [frames, Math.floor(currentT)])

  const team0 = (frames?.players || []).filter(p => p.team === 0)
  const team1 = (frames?.players || []).filter(p => p.team === 1)
  const goalMarkers   = frames?.goals || []
  const safeDuration  = duration || 1

  // ── Render ────────────────────────────────────────────────────────────────
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

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#04090F' }}>

      {/* ── Marcador superior ──────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-1.5"
           style={{ background: '#030810', borderBottom: '1px solid #0A1E35' }}>

        <button
          onClick={() => navigate(-1)}
          className="text-gray-500 hover:text-gray-300 text-sm transition-colors flex items-center gap-1.5"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          ← {replay ? getMapName(replay.map_name) : '—'}
        </button>

        {/* Marcador */}
        <div className="flex items-center gap-0 rounded-lg overflow-hidden"
             style={{ border: '1px solid #1A3A5C' }}>
          <div className="px-4 py-1.5 text-lg font-bold font-display text-white"
               style={{ background: '#1A3F80', minWidth: 48, textAlign: 'center' }}>
            {scores[0]}
          </div>
          <div className="px-4 py-1 text-sm font-mono-num text-gray-300"
               style={{ background: '#0A1A2E', minWidth: 72, textAlign: 'center', letterSpacing: '0.05em' }}>
            {fmt(duration > 0 ? duration - currentT : currentT)}
          </div>
          <div className="px-4 py-1.5 text-lg font-bold font-display text-white"
               style={{ background: '#7A3800', minWidth: 48, textAlign: 'center' }}>
            {scores[1]}
          </div>
        </div>

        {/* Velocidad */}
        <div className="flex items-center gap-1">
          {[0.25, 0.5, 1, 2].map(v => (
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

      {/* ── Área central ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative" ref={containerRef}>

        {/* Panel equipo azul */}
        <div className="flex-shrink-0 w-36 flex flex-col gap-1.5 p-2.5 overflow-y-auto"
             style={{ background: '#030810', borderRight: '1px solid #0A1E35' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1"
             style={{ color: TEAM_COLOR[0] }}>Equipo Azul</p>
          {team0.map((p, i) => <PlayerCard key={i} player={p} team={0} />)}
        </div>

        {/* Canvas + etiquetas HTML */}
        <div className="flex-1 relative overflow-hidden">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full"
                  style={{ display: 'block', touchAction: 'none' }} />

          {(frames?.players || []).map((p, i) => (
            <div key={i}
              ref={el => { labelRefs.current[i] = el }}
              className="absolute pointer-events-none"
              style={{ display: 'none', transform: 'translate(-50%, -100%)', zIndex: 10 }}>
              <div className="flex flex-col items-center gap-0.5">
                {/* Nombre */}
                <div className="px-2 py-0.5 rounded-md text-[11px] font-semibold text-white whitespace-nowrap"
                     style={{
                       background: (p.team === 0 ? '#1A3F80' : '#7A3800') + 'DD',
                       border: `1px solid ${TEAM_COLOR[p.team ?? 0]}55`,
                     }}>
                  {p.name}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Panel equipo naranja */}
        <div className="flex-shrink-0 w-36 flex flex-col gap-1.5 p-2.5 overflow-y-auto"
             style={{ background: '#030810', borderLeft: '1px solid #0A1E35' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1 text-right"
             style={{ color: TEAM_COLOR[1] }}>Equipo Naranja</p>
          {team1.map((p, i) => <PlayerCard key={i} player={p} team={1} />)}
        </div>
      </div>

      {/* ── Timeline inferior ─────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 py-2.5"
           style={{ background: '#030810', borderTop: '1px solid #0A1E35' }}>

        {/* Barra de progreso */}
        <div className="relative mb-2.5" style={{ height: 22 }}>
          {goalMarkers.map((g, i) => {
            const pct   = (g.time / safeDuration) * 100
            const color = TEAM_COLOR[g.team ?? 0]
            return (
              <button key={i} onClick={() => seekTo(Math.max(0, g.time - 1.5))}
                className="absolute top-0 h-full flex items-center justify-center"
                style={{ left: `${pct}%`, transform: 'translateX(-50%)', zIndex: 2 }}>
                <div style={{
                  width: 2, height: '100%',
                  background: color,
                  boxShadow: `0 0 5px ${color}`,
                  borderRadius: 2,
                }} />
              </button>
            )
          })}
          <input
            type="range" min={0} max={safeDuration} step={0.1} value={currentT}
            onChange={e => seekTo(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer absolute bottom-0"
            style={{
              background: `linear-gradient(to right, #2B6FD4 ${(currentT / safeDuration) * 100}%, #0D2240 0%)`,
            }}
          />
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
          <span className="font-mono-num text-sm text-gray-400 flex-shrink-0 tabular-nums">
            {fmt(currentT)} <span className="text-gray-600">/</span> {fmt(safeDuration)}
          </span>

          {/* Saltar a goles */}
          <div className="flex-1 flex gap-2 justify-end text-xs text-gray-500">
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

// ── Tarjeta lateral de jugador ────────────────────────────────────────────────
function PlayerCard({ player, team }) {
  return (
    <div className="rounded-lg px-2.5 py-2"
         style={{
           background: '#07111E',
           border: `1px solid ${TEAM_COLOR[team]}28`,
         }}>
      <p className="text-xs font-semibold text-gray-100 truncate">{player.name}</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: '#0D2240' }}>
          <div className="h-full rounded-full transition-all"
               style={{ width: '33%', background: '#FFB800' }} />
        </div>
        <span className="text-[10px] text-gray-600 font-mono-num">33</span>
      </div>
    </div>
  )
}
