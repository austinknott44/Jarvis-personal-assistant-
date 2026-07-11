// Live voice via the /voice WebSocket -> Gemini Live bridge. Streams 16 kHz
// PCM up, plays 24 kHz PCM back, supports barge-in (server sends
// 'interrupted' -> we flush the playback queue). Free-tier sessions cap at
// ~15 min; on unexpected close while still active we transparently reopen.
import { useEffect, useRef, useState } from 'react'
import type { OrbState } from './StarSphere'

export default function MicButton({
  agentOn,
  onOrbState,
  onTranscript,
}: {
  agentOn: boolean
  onOrbState: (s: OrbState) => void
  onTranscript?: (role: string, text: string, turnComplete?: boolean) => void
}) {
  const [active, setActive] = useState(false)
  const [error, setError] = useState('')
  const wsRef = useRef<WebSocket | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const playTimeRef = useRef(0)
  const activeRef = useRef(false)
  const sourcesRef = useRef<AudioBufferSourceNode[]>([])

  const stop = () => {
    activeRef.current = false
    setActive(false)
    wsRef.current?.close()
    wsRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    ctxRef.current?.close().catch(() => {})
    ctxRef.current = null
    onOrbState('idle')
  }

  useEffect(() => {
    if (!agentOn && activeRef.current) stop() // toggling OFF ends the session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentOn])

  useEffect(() => () => stop(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const flushPlayback = () => {
    sourcesRef.current.forEach((s) => { try { s.stop() } catch { /* already stopped */ } })
    sourcesRef.current = []
    playTimeRef.current = ctxRef.current?.currentTime ?? 0
  }

  const playPcm = (b64: string, rate: number) => {
    const ctx = ctxRef.current
    if (!ctx) return
    const raw = atob(b64)
    const samples = new Int16Array(raw.length / 2)
    for (let i = 0; i < samples.length; i++) {
      samples[i] = (raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8)) << 16 >> 16
    }
    const buffer = ctx.createBuffer(1, samples.length, rate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(ctx.destination)
    const startAt = Math.max(ctx.currentTime, playTimeRef.current)
    src.start(startAt)
    playTimeRef.current = startAt + buffer.duration
    sourcesRef.current.push(src)
    src.onended = () => {
      sourcesRef.current = sourcesRef.current.filter((s) => s !== src)
      if (sourcesRef.current.length === 0 && activeRef.current) onOrbState('idle')
    }
    onOrbState('speaking')
  }

  const open = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const ctx = new AudioContext({ sampleRate: 16000 })
      ctxRef.current = ctx
      playTimeRef.current = 0

      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/voice`)
      wsRef.current = ws

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'audio') playPcm(msg.data, msg.rate || 24000)
        else if (msg.type === 'transcript') onTranscript?.(msg.role, msg.text)
        else if (msg.type === 'turn_complete') onTranscript?.('assistant', '', true)
        else if (msg.type === 'interrupted') flushPlayback() // barge-in
        else if (msg.type === 'error') { setError(msg.message); stop() }
      }
      ws.onclose = () => {
        // free-tier ~15 min cap: transparently reopen if the user still has the mic on
        if (activeRef.current) { setTimeout(() => { if (activeRef.current) open() }, 400) }
      }

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve()
        ws.onerror = () => reject(new Error('voice socket failed'))
      })

      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      source.connect(processor)
      processor.connect(ctx.destination)
      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return
        const input = e.inputBuffer.getChannelData(0)
        const pcm = new Int16Array(input.length)
        for (let i = 0; i < input.length; i++) {
          pcm[i] = Math.max(-32768, Math.min(32767, Math.round(input[i] * 32767)))
        }
        let binary = ''
        const bytes = new Uint8Array(pcm.buffer)
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        ws.send(JSON.stringify({ type: 'audio', data: btoa(binary) }))
      }

      activeRef.current = true
      setActive(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'mic failed')
      stop()
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={() => (active ? stop() : open())}
        disabled={!agentOn}
        title={active ? 'End voice session' : 'Talk to Jarvis'}
        className={`w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all
          ${active
            ? 'border-hud-cyan bg-hud-cyan/20 shadow-[0_0_20px_rgba(34,211,238,0.5)] hud-pulse'
            : 'border-hud-border hover:border-hud-cyan/60'}
          disabled:opacity-30`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
             stroke={active ? '#22d3ee' : '#64748b'} strokeWidth="2" strokeLinecap="round">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4" />
        </svg>
      </button>
      {active && (
        <div className="flex gap-0.5 items-end h-3" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="w-0.5 bg-hud-cyan hud-pulse"
                  style={{ height: `${5 + (i % 3) * 3}px`, animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      )}
      {error && <span className="text-red-400 text-xs max-w-[160px] text-center">{error}</span>}
    </div>
  )
}
