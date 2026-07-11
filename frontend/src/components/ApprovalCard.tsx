// Approval cards — full preview + Approve/Reject. Nothing gated executes
// until the user approves here or from the ntfy push.
import { useState } from 'react'
import { api, type ApprovalItem } from '../api'

export default function ApprovalCard({
  approval,
  onDone,
}: {
  approval: ApprovalItem
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)

  const act = async (approve: boolean) => {
    setBusy(true)
    try {
      if (approve) await api.approve(approval.id)
      else await api.reject(approval.id)
    } finally {
      setBusy(false)
      onDone()
    }
  }

  const preview = approval.preview || {}

  return (
    <div className="hud-panel p-3 border-l-2 border-l-amber-400/70">
      <div className="flex items-center justify-between mb-1">
        <span className="hud-readout text-[10px] uppercase text-amber-300/90">
          Approval required · {approval.action_type.replaceAll('_', ' ')}
        </span>
        <span className="text-[10px] text-hud-dim">
          {new Date(approval.created_at).toLocaleTimeString()}
        </span>
      </div>
      <p className="text-sm mb-2">{approval.description}</p>

      {approval.action_type === 'send_email' && (
        <div className="bg-black/30 rounded p-2 text-xs space-y-1 mb-2 hud-readout">
          <div><span className="text-hud-dim">From:</span> {String(preview.account ?? '')}</div>
          <div><span className="text-hud-dim">To:</span> {String(preview.to ?? '')}</div>
          <div><span className="text-hud-dim">Subject:</span> {String(preview.subject ?? '')}</div>
          <div className="whitespace-pre-wrap border-t border-hud-border pt-1 text-hud-text">
            {String(preview.body ?? '')}
          </div>
        </div>
      )}
      {approval.action_type === 'move_email_marketing' && (
        <div className="bg-black/30 rounded p-2 text-xs space-y-1 mb-2 hud-readout">
          <div><span className="text-hud-dim">Subject:</span> {String(preview.subject ?? '')}</div>
          <div><span className="text-hud-dim">From:</span> {String(preview.sender ?? '')}</div>
          <div><span className="text-hud-dim">Confidence:</span> {Math.round(Number(preview.confidence ?? 0) * 100)}%</div>
        </div>
      )}
      {approval.action_type === 'create_event_with_invitees' && (
        <div className="bg-black/30 rounded p-2 text-xs space-y-1 mb-2 hud-readout">
          <div><span className="text-hud-dim">Event:</span> {String(preview.title ?? '')}</div>
          <div><span className="text-hud-dim">When:</span> {String(preview.start ?? '')}</div>
          <div><span className="text-hud-dim">Invitees:</span> {(preview.attendees as string[] | undefined)?.join(', ')}</div>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => act(true)} disabled={busy}
          className="flex-1 py-1.5 rounded border border-emerald-500/60 text-emerald-300 text-xs
                     hover:bg-emerald-500/10 disabled:opacity-40">
          Approve
        </button>
        <button onClick={() => act(false)} disabled={busy}
          className="flex-1 py-1.5 rounded border border-red-500/60 text-red-300 text-xs
                     hover:bg-red-500/10 disabled:opacity-40">
          Reject
        </button>
      </div>
    </div>
  )
}
