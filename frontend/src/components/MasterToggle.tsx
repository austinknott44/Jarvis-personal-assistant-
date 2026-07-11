export default function MasterToggle({
  on,
  busy,
  onChange,
}: {
  on: boolean
  busy: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      disabled={busy}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all hud-readout text-xs
        ${on
          ? 'border-hud-cyan/70 text-hud-cyan shadow-[0_0_14px_rgba(34,211,238,0.35)]'
          : 'border-hud-border text-hud-dim'}`}
      title="Master on/off — off means no LLM calls, no polling, no cost"
    >
      <span className={`w-2.5 h-2.5 rounded-full ${on ? 'bg-hud-cyan hud-pulse' : 'bg-slate-600'}`} />
      {busy ? '…' : on ? 'ONLINE' : 'OFFLINE'}
    </button>
  )
}
