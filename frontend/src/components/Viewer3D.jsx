/**
 * Viewer3D.jsx — componente Three.js puro para el visor de replays.
 * Acepta `frames` (datos de rrrocket) y controla la reproducción
 * a través de props: playing, speed, currentT, onTimeUpdate.
 */

import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const S = 0.01

const TEAM_HEX = [0x2B6FD4, 0xD46B2B]
const TEAM_COLOR = ['#3A8EFF', '#FF7A00']

const F = {
  hx: 4096 * S, hy: 5120 * S, wallH: 2044 * S,
  goalW: 893 * S, goalH: 642 * S, goalD: 880 * S,
  ballR: 91 * S,
  carW: 118 * S, carL: 84 * S, carH: 36 * S,
  cut: 1820 * S,
}

const BIG_BOOSTS = [
  [-3072, -4096], [3072, -4096], [-3584, 0], [3584, 0], [-3072, 4096], [3072, 4096],
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function pts(...args) { return args.map(([x, y, z]) => new THREE.Vector3(x, y, z)) }
function line(points, color, opacity = 1) {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, opacity, transparent: opacity < 1 })
  )
}
function circle(cx, cy, cz, r, seg = 48) {
  const p = []
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2
    p.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz))
  }
  return p
}
function octPts(z = 0) {
  const { hx, hy, cut } = F
  return pts(
    [-hx + cut, -hy, z], [hx - cut, -hy, z], [hx, -hy + cut, z],
    [hx, hy - cut, z], [hx - cut, hy, z], [-hx + cut, hy, z],
    [-hx, hy - cut, z], [-hx, -hy + cut, z], [-hx + cut, -hy, z]
  )
}

// ── Escena ────────────────────────────────────────────────────────────────────

function buildScene(players) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x04090F)

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 500)
  camera.position.set(-28, -90, 70)
  camera.lookAt(0, 8, 0)

  scene.add(new THREE.AmbientLight(0x445566, 1.8))
  const sun = new THREE.DirectionalLight(0xffffff, 2.0)
  sun.position.set(20, -50, 80); scene.add(sun)
  const fill = new THREE.DirectionalLight(0x3366AA, 0.6)
  fill.position.set(-20, 40, 30); scene.add(fill)

  // Campo bicolor
  const mkFloor = (color, posY) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(F.hx * 2, F.hy),
      new THREE.MeshLambertMaterial({ color })
    )
    m.rotation.x = -Math.PI / 2; m.position.y = posY; return m
  }
  scene.add(mkFloor(0x152B4A, -F.hy / 2))
  scene.add(mkFloor(0x3D1E08,  F.hy / 2))

  // Líneas
  const lw = 0xffffff, lo = 0.45
  scene.add(line(octPts(0.02), lw, lo))
  scene.add(line(pts([-F.hx, 0, 0.02], [F.hx, 0, 0.02]), lw, lo))
  scene.add(line(circle(0, 0, 0.02, F.hx * 0.28), lw, lo))
  for (const sy of [-1, 1])
    scene.add(line(circle(0, sy * F.hy * 0.77, 0.02, F.hx * 0.18, 24), lw, lo * 0.65))

  // Porterías
  for (const [sy, ti] of [[-1, 0], [1, 1]]) {
    const col = TEAM_HEX[ti], gy = sy * F.hy
    scene.add(line(pts(
      [-F.goalW, gy, 0.02], [-F.goalW, gy, F.goalH],
      [F.goalW, gy, F.goalH], [F.goalW, gy, 0.02], [-F.goalW, gy, 0.02]
    ), col, 0.9))
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(F.goalW * 2, F.goalH),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12, side: THREE.DoubleSide })
    )
    bg.position.set(0, sy * (F.hy + F.goalD / 2), F.goalH / 2); scene.add(bg)
  }

  // Paredes sutiles
  const wm = new THREE.MeshBasicMaterial({ color: 0x0A1525, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(F.hy * 2, F.wallH), wm)
    w.position.set(sx * F.hx, 0, F.wallH / 2); w.rotation.y = Math.PI / 2; scene.add(w)
  }
  for (const sy of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(F.hx * 2, F.wallH), wm)
    w.position.set(0, sy * F.hy, F.wallH / 2); scene.add(w)
  }

  // Boost pads
  const bGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.1, 16)
  const bMat = new THREE.MeshStandardMaterial({ color: 0xFFBB00, emissive: 0x664400, roughness: 0.4 })
  for (const [bx, by] of BIG_BOOSTS) {
    const b = new THREE.Mesh(bGeo, bMat)
    b.rotation.x = -Math.PI / 2; b.position.set(bx * S, by * S, 0.05); scene.add(b)
  }

  // Balón
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(F.ballR, 28, 20),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222, roughness: 0.2, metalness: 0.15 })
  )
  ball.position.set(0, 0, F.ballR); scene.add(ball)

  const ballShadow = new THREE.Mesh(
    new THREE.CircleGeometry(F.ballR * 1.5, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })
  )
  ballShadow.rotation.x = -Math.PI / 2; ballShadow.position.z = 0.008; scene.add(ballShadow)

  // Anillos de gol
  const grMat = new THREE.MeshBasicMaterial({ color: 0xFFDD44, transparent: true, opacity: 0 })
  const goalRing = new THREE.Mesh(new THREE.TorusGeometry(F.ballR * 1.6, F.ballR * 0.2, 8, 32), grMat)
  goalRing.rotation.x = Math.PI / 2; scene.add(goalRing)
  const goalRing2 = goalRing.clone(); goalRing2.material = grMat.clone(); scene.add(goalRing2)

  // Coches
  const carMeshes = [], carShadows = []
  for (let i = 0; i < players.length; i++) {
    const team    = players[i].team ?? (i % 2)
    const teamCol = new THREE.Color(TEAM_HEX[team])
    const emCol   = teamCol.clone().multiplyScalar(0.18)
    const group   = new THREE.Group()

    const bMat2 = new THREE.MeshStandardMaterial({ color: teamCol, emissive: emCol, roughness: 0.3, metalness: 0.55 })
    group.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(F.carW, F.carL, F.carH * 0.7), bMat2)))

    const rMat = new THREE.MeshStandardMaterial({ color: teamCol.clone().multiplyScalar(1.15), emissive: emCol, roughness: 0.25, metalness: 0.6 })
    const roof = new THREE.Mesh(new THREE.BoxGeometry(F.carW * 0.7, F.carL * 0.55, F.carH * 0.4), rMat)
    roof.position.z = F.carH * 0.55; group.add(roof)

    // Indicador frontal blanco (muestra dirección del coche)
    const fMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbbbbbb, emissiveIntensity: 0.4, roughness: 0.5 })
    const front = new THREE.Mesh(new THREE.BoxGeometry(F.carW * 0.55, F.carH * 0.12, F.carH * 0.55), fMat)
    front.position.y = F.carL / 2 + F.carH * 0.06; group.add(front)

    group.position.set(0, 0, -200)
    scene.add(group); carMeshes.push(group)

    // Sombra circular en suelo
    const sMat = new THREE.MeshBasicMaterial({ color: TEAM_HEX[team], transparent: true, opacity: 0.2 })
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(F.carW * 0.75, 14), sMat)
    shadow.rotation.x = -Math.PI / 2; shadow.position.z = 0.01
    scene.add(shadow); carShadows.push(shadow)
  }

  return { scene, camera, ball, ballShadow, carMeshes, carShadows, goalRing, goalRing2 }
}

// ── Interpolación ─────────────────────────────────────────────────────────────

function bsearch(arr, t) {
  let lo = 0, hi = arr.length - 1
  while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (arr[mid][0] <= t) lo = mid; else hi = mid }
  return [lo, Math.min(lo + 1, hi)]
}

function getBallAt(frames, t) {
  if (!frames?.length) return null
  const [lo, hi] = bsearch(frames, t)
  const a = frames[lo], b = frames[hi]
  if (!b || a[0] === b[0]) return { x: a[1], y: a[2], z: a[3] }
  const f = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])))
  return { x: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f, z: a[3] + (b[3] - a[3]) * f }
}

export function buildCarIndex(carFrames) {
  const idx = {}
  for (const fr of (carFrames || [])) {
    const p = fr[1]; if (!idx[p]) idx[p] = []; idx[p].push(fr)
  }
  return idx
}

function getCarAt(playerFrames, t) {
  if (!playerFrames?.length) return null
  const [lo, hi] = bsearch(playerFrames, t)
  const a = playerFrames[lo], b = playerFrames[hi]
  const hasQ = a.length >= 9

  if (!b || a[0] === b[0]) {
    return {
      x: a[2], y: a[3], z: a[4],
      q: hasQ ? new THREE.Quaternion(a[5], a[6], a[7], a[8])
               : new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, a[5])),
    }
  }
  const f = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])))
  let q
  if (hasQ) {
    const qa = new THREE.Quaternion(a[5], a[6], a[7], a[8])
    qa.slerp(new THREE.Quaternion(b[5], b[6], b[7], b[8]), f)
    q = qa
  } else {
    q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, a[5] + (b[5] - a[5]) * f))
  }
  return { x: a[2] + (b[2] - a[2]) * f, y: a[3] + (b[3] - a[3]) * f, z: a[4] + (b[4] - a[4]) * f, q }
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function Viewer3D({ frames, playing, speed, currentT, onTimeUpdate, labelRefs }) {
  const canvasRef  = useRef(null)
  const sceneRef   = useRef(null)
  const rafRef     = useRef(null)
  const lastRef    = useRef(null)
  const playingRef = useRef(false)
  const tRef       = useRef(0)
  const speedRef   = useRef(1)
  const framesRef  = useRef(null)
  const carIdxRef  = useRef(null)

  // Sync refs con props (evita recrear la escena al cambiar estos valores)
  useEffect(() => { playingRef.current = playing }, [playing])
  useEffect(() => { speedRef.current   = speed   }, [speed])
  useEffect(() => { tRef.current = currentT; lastRef.current = null }, [currentT])

  // Inicializar Three.js cuando llegan los frames
  useEffect(() => {
    if (!frames || !canvasRef.current) return

    const canvas   = canvasRef.current
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    const { scene, camera, ball, ballShadow, carMeshes, carShadows, goalRing, goalRing2 } =
      buildScene(frames.players || [])

    framesRef.current = frames
    carIdxRef.current = buildCarIndex(frames.cars)

    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true; controls.dampingFactor = 0.07
    controls.minDistance = 10; controls.maxDistance = 220
    controls.maxPolarAngle = Math.PI * 0.52; controls.target.set(0, 4, 0)

    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(canvas)

    sceneRef.current = { renderer, scene, camera, controls, ball, ballShadow, carMeshes, carShadows, goalRing, goalRing2 }

    const CELEB = 3.5

    function animate(now) {
      rafRef.current = requestAnimationFrame(animate)
      if (playingRef.current && lastRef.current != null) {
        const dt = Math.min((now - lastRef.current) / 1000, 0.05)
        const next = Math.min(tRef.current + dt * speedRef.current, framesRef.current?.duration || 0)
        tRef.current = next
        if (next >= (framesRef.current?.duration || 0)) { playingRef.current = false }
        onTimeUpdate?.(next)
      }
      lastRef.current = now

      const t   = tRef.current
      const frd = framesRef.current
      if (!frd) { controls.update(); renderer.render(scene, camera); return }

      const ag = (frd.goals || []).find(g => t >= g.time && t < g.time + CELEB)

      // Balón
      const bp = getBallAt(frd.ball, t)
      if (bp) {
        ball.position.set(bp.x * S, bp.y * S, bp.z * S)
        ballShadow.position.set(bp.x * S, bp.y * S, 0.008)
      }

      // Efecto gol
      if (ag) {
        const ph = Math.min((t - ag.time) / CELEB, 1)
        const hex = TEAM_HEX[ag.team ?? 0]
        goalRing.scale.setScalar(1 + ph * 7); goalRing.position.copy(ball.position)
        goalRing.material.color.set(hex); goalRing.material.opacity = Math.max(0, 0.85 - ph * 1.1)
        const p2 = Math.max(0, ph - 0.15)
        goalRing2.scale.setScalar(1 + p2 * 4); goalRing2.position.copy(ball.position)
        goalRing2.material.color.set(0xffffff); goalRing2.material.opacity = Math.max(0, 0.65 - p2 * 1.3)
        ball.scale.setScalar(1 + Math.sin(ph * Math.PI) * 2)
        ball.material.emissive.set(hex); ball.material.emissiveIntensity = 1 - ph
      } else {
        goalRing.material.opacity = goalRing2.material.opacity = 0
        ball.scale.setScalar(1); ball.material.emissive.set(0x222222); ball.material.emissiveIntensity = 1
      }

      // Coches
      const cidx = carIdxRef.current || {}
      carMeshes.forEach((mesh, i) => {
        const pos    = getCarAt(cidx[i], t)
        const shadow = carShadows[i]
        const lel    = labelRefs?.current?.[i]

        if (!pos) {
          mesh.visible = false; if (shadow) shadow.visible = false; if (lel) lel.style.display = 'none'; return
        }
        const wx = pos.x * S, wy = pos.y * S, wz = pos.z * S
        if (Math.abs(wx) < F.hx * 1.7 && Math.abs(wy) < F.hy * 1.7) {
          mesh.position.set(wx, wy, wz); mesh.quaternion.copy(pos.q); mesh.visible = true
          if (shadow) {
            shadow.position.set(wx, wy, 0.01); shadow.visible = true
            shadow.material.opacity = 0.25 * Math.max(0, 1 - wz / (F.wallH * 0.8))
          }
          if (lel) {
            const sp = new THREE.Vector3(wx, wy, wz + F.carH + 0.9).project(camera)
            const cw = canvas.clientWidth, ch = canvas.clientHeight
            if (sp.z < 1) {
              lel.style.display = 'block'
              lel.style.left    = ((sp.x + 1) / 2 * cw) + 'px'
              lel.style.top     = ((-sp.y + 1) / 2 * ch) + 'px'
            } else { lel.style.display = 'none' }
          }
        } else {
          mesh.visible = false; if (shadow) shadow.visible = false; if (lel) lel.style.display = 'none'
        }
      })

      controls.update(); renderer.render(scene, camera)
    }
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(rafRef.current); ro.disconnect(); controls.dispose(); renderer.dispose(); sceneRef.current = null
    }
  }, [frames])

  return (
    <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ display: 'block', touchAction: 'none' }} />
  )
}
