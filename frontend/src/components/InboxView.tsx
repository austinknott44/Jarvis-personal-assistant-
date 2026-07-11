// Inbox — the unified 3-account email view (Gmail / Outlook / iCloud),
// needs-reply + deadline flags, account filter, and the cleanup runner.
// Sending always goes through the approval gate (ask Jarvis in chat to draft).
import { useCallback, useEffect, useState } from 'react'
import { api, type InboxMsg } from '../api'

const ACCOUNT_COLORS: Record<string, string> = {
  gmail: 'text-red-300 border-red-400/40',
  outlook: 'text-blue-300 border-blue-400/40',
  icloud: 'text-slate-300 border-slate-400/40',
}

export default function InboxView() {
  const [inbox, setInbox] = useState<InboxMsg[] | null>(null)
  const [filter, setFilter] = useState<'all' | 'gmail' | 'outlook' | 'icloud' | 'reply'>('all')
  const [notice, setNotice] = useState('')
  const [cleaning, setCleaning] = useState(false)

  const load = useCallback(() => {
    api.inbox().then((r) => setInbox(r.inbox)).catch(() => setInbox([]))
  }, [])
  useEffect(load, [load])

  const runCleanup = async () => {
    setCleaning(true)
    setNotice('')
    try {
      const r = await api.cleanupRun()
      if ('error' in r) setNotice(String((r as { error?: string }).error))
      else setNotice(`Cleanup: moved ${r.moved.length} to Jarvis/Marketing, queued ${r.queued_for_approval.length} for approval.`)
      load()
    } finally {
      setCleaning(false)
    }
  }

  const shown = (inbox ?? []).filter((m) =>
    filter === 'all' ? true : filter === 'reply' ? m.needs_reply : m.account === filter)

  const counts = {
    all: inbox?.length ?? 0,
    gmail: (inbox ?? []).filter((m) => m.account === 'gmail').length,
    outlook: (inbox ?? []).filter((m) => m.account === 'outlook').length,
    icloud: (inbox ?? []).filter((m) => m.account === 'icloud').length,
    reply: (inbox ?? []).filter((m) => m.needs_reply).length,
  }

  return (
    <div className="h-full flex flex-col p-4 gap-3 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="hud-readout text-hud-cyan text-sm uppercase tracking-widest hud-glow">Inbox</h2>
        <div className="flex rounded overflow-hidden border border-hud-border ml-2">
          {(['all', 'gmail', 'outlook', 'icloud', 'reply'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-[10px] uppercase hud-readout ${filter === f ? 'bg-hud-cyan/20 text-hud-cyan' : 'text-hud-dim hover:text-hud-text'}`}>
              {f === 'reply' ? 'needs reply' : f} ({counts[f]})
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={load}
            className="px-3 py-1 text-xs border border-hud-border rounded text-hud-dim hover:text-hud-cyan">
            Refresh
          </button>
          <button onClick={runCleanup} disabled={cleaning}
            className="px-3 py-1 text-xs border border-hud-cyan/40 rounded text-hud-cyan hover:bg-hud-cyan/10 disabled:opacity-40">
            {cleaning ? 'Scanning…' : 'Clean up marketing'}
          </button>
        </div>
      </div>
      <p className="text-xs text-hud-dim">
        To reply, tell Jarvis in chat — “draft a reply to …” — drafts are free, sending always asks your approval.
        School mail is never touched by cleanup.
      </p>
      {notice && <p className="text-xs text-hud-cyan">{notice}</p>}

      <div className="flex-1 overflow-y-auto space-y-1">
        {inbox === null && <p className="text-hud-dim text-sm text-center mt-8">Loading…</p>}
        {inbox !== null && shown.length === 0 && (
          <p className="text-hud-dim text-sm text-center mt-8">
            {inbox.length === 0
              ? 'No email accounts connected yet — connect Gmail, Outlook, or iCloud in Preferences.'
              : 'Nothing matches this filter.'}
          </p>
        )}
        {shown.map((m) => (
          <div key={`${m.account}-${m.id}`}
               className={`hud-panel p-2.5 flex items-start gap-3 ${m.unread ? '' : 'opacity-60'}`}>
            <span className={`hud-readout text-[9px] uppercase border rounded px-1.5 py-0.5 shrink-0 mt-0.5 ${ACCOUNT_COLORS[m.account] ?? 'text-hud-dim border-hud-border'}`}>
              {m.account}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <p className={`text-sm truncate ${m.unread ? 'text-hud-text font-medium' : 'text-hud-dim'}`}>
                  {m.subject || '(no subject)'}
                </p>
                {m.needs_reply && (
                  <span className="hud-readout text-[8px] uppercase text-amber-300 border border-amber-400/50 rounded px-1 shrink-0">reply</span>
                )}
                {m.deadline_flag && (
                  <span className="hud-readout text-[8px] uppercase text-hud-cyan border border-hud-cyan/50 rounded px-1 shrink-0"
                        title="Looks deadline-related — confirm before Jarvis adds it">deadline?</span>
                )}
              </div>
              <p className="text-xs text-hud-dim truncate">{m.sender}</p>
              {m.snippet && <p className="text-xs text-hud-dim/70 truncate">{m.snippet}</p>}
            </div>
            <span className="text-[10px] text-hud-dim hud-readout shrink-0">{m.date?.slice(0, 16).replace('T', ' ')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
