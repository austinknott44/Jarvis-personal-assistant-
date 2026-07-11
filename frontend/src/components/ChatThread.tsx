// Chat thread — the single live transcript for BOTH typed chat and voice
// sessions (voice transcripts stream in via the `transcript` prop).
import { useEffect, useRef, useState } from 'react'
import { api, type ChatTurn } from '../api'

export interface TranscriptChunk {
  seq: number        // monotonically increasing so re-renders don't re-append
  role: string
  text: string
  turnComplete?: boolean
}

export default function ChatThread({
  agentOn,
  onThinking,
  greeting,
  transcript,
}: {
  agentOn: boolean
  onThinking: (thinking: boolean) => void
  greeting: string | null
  transcript: TranscriptChunk | null
}) {
  const [turns, setTurns] = useState<(ChatTurn & { live?: boolean })[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastSeqRef = useRef(-1)

  useEffect(() => {
    api.chatHistory().then((r) => setTurns(r.history)).catch(() => {})
  }, [])

  useEffect(() => {
    if (greeting) setTurns((t) => [...t, { role: 'assistant', content: greeting }])
  }, [greeting])

  // Voice transcript chunks: append to the current live bubble of the same
  // role, or open a new one. turn_complete seals the live bubbles.
  useEffect(() => {
    if (!transcript || transcript.seq <= lastSeqRef.current) return
    lastSeqRef.current = transcript.seq
    setTurns((prev) => {
      if (transcript.turnComplete) {
        return prev.map((t) => ({ ...t, live: false }))
      }
      const last = prev[prev.length - 1]
      if (last?.live && last.role === transcript.role) {
        return [...prev.slice(0, -1), { ...last, content: last.content + transcript.text }]
      }
      return [...prev.map((t) => ({ ...t, live: false })), { role: transcript.role, content: transcript.text, live: true }]
    })
  }, [transcript])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  const send = async () => {
    const message = input.trim()
    if (!message || busy) return
    setInput('')
    setTurns((t) => [...t, { role: 'user', content: message }])
    setBusy(true)
    onThinking(true)
    try {
      const r = await api.chat(message)
      setTurns((t) => [...t, { role: 'assistant', content: r.reply }])
    } catch {
      setTurns((t) => [...t, { role: 'assistant', content: '(connection error — is the backend running?)' }])
    } finally {
      setBusy(false)
      onThinking(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-3 pr-2">
        {turns.length === 0 && (
          <p className="text-hud-dim text-sm text-center mt-8 hud-readout">
            {agentOn
              ? 'Type or talk — this is the live transcript. Ask "what can you do?"'
              : 'Flip the master toggle to wake Jarvis.'}
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                t.role === 'user'
                  ? 'bg-hud-blue/20 border border-hud-blue/40 text-slate-100'
                  : 'hud-panel text-hud-text'
              } ${t.live ? 'opacity-90 border-dashed' : ''}`}
            >
              {t.content}
              {t.live && <span className="hud-pulse text-hud-cyan"> ▍</span>}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={!agentOn}
          placeholder={agentOn ? 'Message Jarvis — or press the mic and just talk…' : 'Jarvis is off'}
          className="flex-1 bg-hud-panel border border-hud-border rounded-lg px-3 py-2 text-sm
                     focus:outline-none focus:border-hud-cyan/60 disabled:opacity-40"
        />
        <button
          onClick={send}
          disabled={!agentOn || busy}
          className="px-4 py-2 rounded-lg border border-hud-cyan/50 text-hud-cyan text-sm
                     hover:bg-hud-cyan/10 disabled:opacity-30 transition-colors"
        >
          {busy ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
