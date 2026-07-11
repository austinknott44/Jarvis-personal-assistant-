// The star-sphere orb, v2 — a layered "galaxy" built from GPU point shaders:
//   · 7,000-star main sphere with per-star size, color temperature (cyan-white
//     core palette with warm and blue outliers), depth jitter, and twinkle
//   · a tilted 2,200-particle halo disk counter-rotating like an accretion ring
//   · a pulsing additive core with an outer atmosphere shell
// States: idle = slow drift · thinking = fast spin + agitated twinkle ·
// speaking = expands, stills, and breathes with the voice · off = dim ember.
// Reduced-motion users get a static render with a gentle opacity pulse only.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export type OrbState = 'idle' | 'thinking' | 'speaking' | 'off'

const STAR_COUNT = 7000
const HALO_COUNT = 2200
const RADIUS = 1.6

const SPEEDS: Record<OrbState, number> = {
  idle: 0.0016,
  thinking: 0.024,
  speaking: 0.00012,
  off: 0.0004,
}

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uActivity;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vColor = aColor;
    float speed = 1.2 + uActivity * 4.0;
    vTwinkle = 0.65 + 0.35 * sin(uTime * speed + aPhase);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * vTwinkle * uPixelRatio * (15.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`

const FRAG = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float glow = smoothstep(0.5, 0.0, d);
    float core = smoothstep(0.14, 0.0, d);
    float alpha = (glow * glow * glow * 0.5 + core * 0.9) * vTwinkle * uOpacity;
    gl_FragColor = vec4(vColor, alpha);
  }
`

function starColor(): [number, number, number] {
  const r = Math.random()
  if (r < 0.68) { // cyan-white body
    const t = Math.random()
    return [0.25 + 0.55 * t, 0.75 + 0.2 * t, 0.95]
  }
  if (r < 0.88) return [0.92, 0.96, 1.0]                 // hot white
  if (r < 0.96) return [1.0, 0.82, 0.58]                 // warm giants
  return [0.45, 0.62, 1.0]                               // deep blue
}

function buildPoints(count: number, position: (i: number) => [number, number, number],
                     sizeRange: [number, number]) {
  const positions = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const phases = new Float32Array(count)
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const [x, y, z] = position(i)
    positions.set([x, y, z], i * 3)
    // size distribution skews small with rare bright stars
    const u = Math.random()
    sizes[i] = sizeRange[0] + (sizeRange[1] - sizeRange[0]) * u * u * u
    phases[i] = Math.random() * Math.PI * 2
    colors.set(starColor(), i * 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  return geo
}

export default function StarSphere({ state, size = 460 }: { state: OrbState; size?: number }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<OrbState>(state)
  stateRef.current = state

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.z = 4.7

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(size, size)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)

    const uniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0.9 },
      uActivity: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    }
    const material = new THREE.ShaderMaterial({
      uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })

    // main sphere — Fibonacci distribution with radial depth jitter
    const golden = Math.PI * (3 - Math.sqrt(5))
    const sphereGeo = buildPoints(STAR_COUNT, (i) => {
      const y = 1 - (i / (STAR_COUNT - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const theta = golden * i
      const jitter = RADIUS * (1 + (Math.random() - 0.5) * 0.05)
      return [Math.cos(theta) * r * jitter, y * jitter, Math.sin(theta) * r * jitter]
    }, [1.3, 4.2])
    const sphere = new THREE.Points(sphereGeo, material)

    // halo — tilted accretion ring, denser at inner edge
    const haloGeo = buildPoints(HALO_COUNT, () => {
      const a = Math.random() * Math.PI * 2
      const rr = RADIUS * (1.18 + Math.pow(Math.random(), 1.6) * 0.85)
      return [Math.cos(a) * rr, (Math.random() - 0.5) * 0.1 * rr, Math.sin(a) * rr]
    }, [0.9, 2.6])
    const halo = new THREE.Points(haloGeo, material)
    const haloGroup = new THREE.Group()
    haloGroup.add(halo)
    haloGroup.rotation.set(0.42, 0, -0.18)

    // core + atmosphere
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x7fd9ef, transparent: true, opacity: 0.5,
                                    blending: THREE.AdditiveBlending, depthWrite: false }))
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x0e7490, transparent: true, opacity: 0.28,
                                    blending: THREE.AdditiveBlending, depthWrite: false }))

    const group = new THREE.Group()
    group.add(sphere, haloGroup, core, atmo)
    scene.add(group)

    let scale = 1
    let raf = 0
    const animate = (t: number) => {
      raf = requestAnimationFrame(animate)
      const s = stateRef.current
      uniforms.uTime.value = t / 1000

      if (!reducedMotion) {
        sphere.rotation.y += SPEEDS[s]
        sphere.rotation.x += SPEEDS[s] * 0.22
        halo.rotation.y -= SPEEDS[s] * 0.55
        group.rotation.z = 0.05 * Math.sin(t / 24000)   // slow galactic wobble
      }

      // activity drives twinkle agitation
      const targetActivity = s === 'thinking' ? 1 : s === 'speaking' ? 0.35 : 0.08
      uniforms.uActivity.value += (targetActivity - uniforms.uActivity.value) * 0.05

      // speaking: expand + breathe
      const breathe = s === 'speaking' ? 1.13 + Math.sin(t / 240) * 0.028 : 1
      scale += (breathe - scale) * 0.06
      group.scale.setScalar(scale)
      const corePulse = s === 'speaking' ? 1.6 + Math.sin(t / 240) * 0.25
                       : s === 'thinking' ? 1.15 + Math.sin(t / 90) * 0.08 : 1
      core.scale.setScalar(corePulse)
      atmo.scale.setScalar(1 + (corePulse - 1) * 0.5)

      const targetOpacity = s === 'off' ? 0.16 : s === 'speaking' ? 1.0 : 0.9
      uniforms.uOpacity.value += (targetOpacity - uniforms.uOpacity.value) * 0.05
      if (reducedMotion && s !== 'off') {
        uniforms.uOpacity.value = 0.75 + Math.sin(t / 900) * 0.15
      }

      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(raf)
      renderer.dispose()
      sphereGeo.dispose()
      haloGeo.dispose()
      material.dispose()
      core.geometry.dispose()
      atmo.geometry.dispose()
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
