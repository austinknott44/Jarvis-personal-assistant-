// Cleanup Review — every marketing move/delete Jarvis made, with undo for
// moved items. School mail never appears here because it's never touched.
import { useCallback, useEffect, useState } from 'react'
import { api, type CleanupEntry } from '../api'

export default function CleanupReview() {
  const [log, setLog] = useState<CleanupEntry[]>([])
  const [notice, setNotice] = useState('')
  const [running, setRunning] = useState(false)

  const load = useCallback(() => {
    api.cleanupLog().then((r) => setLog(r.log)).catch(() => {})
  }, [])
  useEffect(load, [load])

  const runCleanup = async () => {
    setRunning(true)
    setNotice('')
    try {
      const r = await api.cleanupRun()
      if ('error' in r) setNotice(String((r as { error?: string }).error))
      else setNotice(`Moved ${r.moved.length}, queued ${r.queued_for_approval.length} for your approval.`)
      load()
    } finally {
      setRunning(false)
    }
  }

  const undo = async (messageId: string) => {
    await api.cleanupUndo(messageId)
    setNotice('Restored to inbox.')
    load()
  }

  const badge = (action: string) =>
    action === 'moved' ? 'text-amber-300 border-amber-400/50'
    : action === 'deleted' ? 'text-red-300 border-red-400/50'
    : 'text-emerald-300 border-emerald-400/50'

  return (
    <div className="h-full flex flex-col p-4 gap-3 overflow-hidden">
      <div className="flex items-center gap-3">
        <h2 className="hud-readout text-hud-cyan text-sm uppercase tracking-widest hud-glow">Cleanup Review</h2>
        <button onClick={runCleanup} disabled={running}
          className="px-3 py-1 text-xs border border-hud-cyan/40 rounded text-hud-cyan hover:bg-hud-cyan/10 disabled:opacity-40">
          {running ? 'Scanning…' : 'Clean up inbox now'}
        </button>
      </div>
      <p className="text-xs text-hud-dim">
        ≥95%-confident marketing is auto-moved to Jarvis/Marketing (and auto-trashed after 3 weeks — recoverable).
        Anything less certain asks first. Purdue/school mail is never touched.
      </p>
      {notice && <p className="text-xs text-hud-cyan">{notice}</p>}

      <div className="flex-1 overflow-y-auto space-y-1">
        {log.length === 0 && <p className="text-hud-dim text-sm mt-6 text-center">No cleanup activity yet.</p>}
        {log.map((e) => (
          <div key={e.id} className="hud-panel p-2 flex items-center gap-3 text-xs">
            <span className={`hud-readout uppercase border rounded px-1.5 py-0.5 text-[9px] ${badge(e.action)}`}>
              {e.action}
            </span>
            <div className="flex-1 min-w-0">
              <p className="truncate">{e.subject || '(no subject)'}</p>
              <p className="text-hud-dim truncate">{e.sender} · {Math.round(e.confidence * 100)}% · {new Date(e.at).toLocaleString()}</p>
            </div>
            {e.action === 'moved' && (
              <button onClick={() => undo(e.message_id)}
                className="px-2 py-1 border border-hud-border rounded text-hud-dim hover:text-hud-cyan shrink-0">
                Undo
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
