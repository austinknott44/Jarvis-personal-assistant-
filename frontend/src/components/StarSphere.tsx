// The star-sphere orb — thousands of dots on a sphere (Three.js points).
// idle: slow starfield rotation · thinking: fast rotation (spin IS the loading
// indicator) · speaking: expands slightly, stops rotating, pulses gently.
// Reduced-motion users get a static sphere with an opacity pulse only.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export type OrbState = 'idle' | 'thinking' | 'speaking' | 'off'

const STAR_COUNT = 4000
const RADIUS = 1.6

const SPEEDS: Record<OrbState, number> = {
  idle: 0.0016,
  thinking: 0.02,
  speaking: 0.0001,
  off: 0.0004,
}

export default function StarSphere({ state, size = 420 }: { state: OrbState; size?: number }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<OrbState>(state)
  stateRef.current = state

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.z = 4.6

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(size, size)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)

    // Fibonacci-sphere distribution — even star coverage
    const positions = new Float32Array(STAR_COUNT * 3)
    const golden = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < STAR_COUNT; i++) {
      const y = 1 - (i / (STAR_COUNT - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const theta = golden * i
      positions[i * 3] = Math.cos(theta) * r * RADIUS
      positions[i * 3 + 1] = y * RADIUS
      positions[i * 3 + 2] = Math.sin(theta) * r * RADIUS
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const material = new THREE.PointsMaterial({
      color: 0x22d3ee,
      size: 0.016,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const points = new THREE.Points(geometry, material)
    scene.add(points)

    // faint inner core glow
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0x0e7490, transparent: true, opacity: 0.35 })
    )
    scene.add(core)

    let frame = 0
    let scale = 1
    let raf = 0

    const animate = (t: number) => {
      raf = requestAnimationFrame(animate)
      frame++
      const s = stateRef.current

      if (!reducedMotion) {
        points.rotation.y += SPEEDS[s]
        points.rotation.x += SPEEDS[s] * 0.28
      }

      // speaking: expand + gentle pulse; otherwise ease back to 1
      const targetScale = s === 'speaking' ? 1.12 + Math.sin(t / 260) * 0.025 : 1
      scale += (targetScale - scale) * 0.06
      points.scale.setScalar(scale)
      core.scale.setScalar(s === 'speaking' ? 1.5 + Math.sin(t / 260) * 0.15 : 1)

      const targetOpacity = s === 'off' ? 0.22 : s === 'speaking' ? 1.0 : 0.85
      material.opacity += (targetOpacity - material.opacity) * 0.05
      material.color.setHex(s === 'off' ? 0x475569 : 0x22d3ee)

      if (reducedMotion && s !== 'off') {
        material.opacity = 0.7 + Math.sin(t / 900) * 0.15 // fallback: opacity pulse only
      }

      if (frame % (s === 'thinking' ? 1 : 2) === 0) renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(raf)
      renderer.dispose()
      geometry.dispose()
      material.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [size])

  return (
    <div
      ref={mountRef}
      style={{ width: size, height: size }}
      className="mx-auto select-none"
      aria-label={`Jarvis orb — ${state}`}
      role="img"
    />
  )
}
