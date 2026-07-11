import { useEffect, useRef, useState } from 'react'
import { api, type ChatTurn } from '../api'

export default function ChatThread({
  agentOn,
  onThinking,
  greeting,
}: {
  agentOn: boolean
  onThinking: (thinking: boolean) => void
  greeting: string | null
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.chatHistory().then((r) => setTurns(r.history)).catch(() => {})
  }, [])

  useEffect(() => {
    if (greeting) setTurns((t) => [...t, { role: 'assistant', content: greeting }])
  }, [greeting])

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
            {agentOn ? 'Say something — Jarvis is listening.' : 'Flip the master toggle to wake Jarvis.'}
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                t.role === 'user'
                  ? 'bg-hud-blue/20 border border-hud-blue/40 text-slate-100'
                  : 'hud-panel text-hud-text'
              }`}
            >
              {t.content}
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
          placeholder={agentOn ? 'Message Jarvis…' : 'Jarvis is off'}
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
