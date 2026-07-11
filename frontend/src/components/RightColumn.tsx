// Home HUD right column: news & key events (top) → three stock-pick squares
// side by side → agent status (LLM usage, errors, all-clear).
import { useEffect, useState } from 'react'
import { api, type AgentStatus, type NewsResult, type StockPick } from '../api'

function Panel({ title, children, right, grow }: { title: string; children: React.ReactNode; right?: React.ReactNode; grow?: boolean }) {
  return (
    <div className={`hud-panel p-3 ${grow ? 'flex-1 min-h-40 flex flex-col overflow-hidden' : ''}`}>
      <div className="flex items-center justify-between mb-2 shrink-0">
        <h3 className="hud-readout text-[10px] uppercase tracking-widest text-hud-cyan/80">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  )
}

export default function RightColumn({ refreshKey }: { refreshKey: number }) {
  const [news, setNews] = useState<NewsResult | null>(null)
  const [picks, setPicks] = useState<StockPick[]>([])
  const [picksNote, setPicksNote] = useState('')
  const [status, setStatus] = useState<AgentStatus | null>(null)

  useEffect(() => {
    api.news().then(setNews).catch(() => {})
    api.marketPicks().then((r) => { setPicks(r.picks); setPicksNote(r.note ?? '') }).catch(() => {})
  }, [refreshKey])

  useEffect(() => {
    const loadStatus = () => api.agentStatus().then(setStatus).catch(() => {})
    loadStatus()
    const t = setInterval(loadStatus, 30000)
    return () => clearInterval(t)
  }, [refreshKey])

  return (
    <div className="h-full flex flex-col gap-3">
      {/* ---- News & key events (grows to fill) ---- */}
      <Panel title="News & Key Events" grow>
        {!news && <p className="text-hud-dim text-xs">Loading headlines…</p>}
        {news?.summary && !news.summary.startsWith('(') && (
          <div className="shrink-0 mb-2 pb-2 border-b border-hud-border/60">
            <p className="hud-readout text-[9px] uppercase text-hud-cyan/60 mb-1">Key read</p>
            <p className="text-xs text-hud-text/90 leading-relaxed">{news.summary}</p>
          </div>
        )}
        <div className="space-y-1.5 overflow-y-auto flex-1">
          {news?.headlines?.slice(0, 16).map((h, i) => (
            <a key={i} href={h.link} target="_blank" rel="noreferrer"
               className="block text-xs text-hud-text hover:text-hud-cyan transition-colors leading-snug">
              <span className="text-hud-dim hud-readout text-[9px] uppercase mr-1">{h.source.slice(0, 18)}</span>
              {h.title}
            </a>
          ))}
          {news?.note && <p className="text-hud-dim text-xs">{news.note}</p>}
        </div>
      </Panel>

      {/* ---- Three stock squares ---- */}
      <div className="shrink-0">
        <h3 className="hud-readout text-[10px] uppercase tracking-widest text-hud-cyan/80 mb-2 px-1">
          Stocks on the radar today
        </h3>
        {picks.length === 0 ? (
          <div className="hud-panel p-3">
            <p className="text-hud-dim text-xs">{picksNote || 'Computing today’s picks…'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {picks.map((p) => {
              const day = parseFloat(p.change_pct)
              return (
                <div key={p.ticker} className="hud-panel p-2.5 flex flex-col gap-0.5">
                  <p className="hud-readout text-hud-cyan text-sm hud-glow">{p.ticker}</p>
                  <p className="text-[10px] text-hud-dim leading-tight" title={p.name}>{p.name}</p>
                  <p className="hud-readout text-base mt-0.5">${p.price.toFixed(2)}</p>
                  <p className={`hud-readout text-[10px] ${day >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {day >= 0 ? '▲' : '▼'} {p.change_pct}% today
                  </p>
                  {p.week_change_pct != null && (
                    <p className={`hud-readout text-[10px] ${p.week_change_pct >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
                      {p.week_change_pct >= 0 ? '+' : ''}{p.week_change_pct}% / 7d
                    </p>
                  )}
                  <p className="text-[9px] text-hud-dim mt-1 leading-snug" title={p.why}>{p.why}</p>
                </div>
              )
            })}
          </div>
        )}
        <p className="text-[9px] text-hud-dim mt-1 px-1">Educational only — not financial advice. Jarvis cannot trade.</p>
      </div>

      {/* ---- Agent status ---- */}
      <div className="shrink-0">
      <Panel
        title="Agent Status"
        right={
          <span className={`hud-readout text-[9px] uppercase px-1.5 py-0.5 rounded border
            ${status?.all_clear ? 'text-emerald-300 border-emerald-500/50' : 'text-amber-300 border-amber-400/50'}`}>
            {status ? (status.all_clear ? 'All systems nominal' : `${status.problems.length} notice(s)`) : '…'}
          </span>
        }
      >
        {status && (
          <div className="space-y-1.5 text-xs">
            <div className="grid grid-cols-3 gap-2 hud-readout text-center">
              <div>
                <p className={`text-lg ${status.agent_on ? 'text-hud-cyan' : 'text-hud-dim'}`}>
                  {status.agent_on ? 'ON' : 'OFF'}
                </p>
                <p className="text-[9px] text-hud-dim uppercase">Agent</p>
              </div>
              <div>
                <p className="text-lg text-hud-cyan">{status.llm.calls_today}</p>
                <p className="text-[9px] text-hud-dim uppercase">LLM calls today</p>
              </div>
              <div>
                <p className={`text-lg ${status.llm.errors_today ? 'text-red-400' : 'text-hud-cyan'}`}>
                  {status.llm.errors_today}
                </p>
                <p className="text-[9px] text-hud-dim uppercase">Errors</p>
              </div>
            </div>
            <p className="text-[10px] text-hud-dim hud-readout">
              model: {status.llm.model}
              {status.llm.last_call_at && ` · last call ${status.llm.last_call_at.slice(11, 19)} UTC`}
              {status.pending_approvals > 0 && ` · ${status.pending_approvals} approval(s) pending`}
            </p>
            {status.problems.length > 0 && (
              <ul className="space-y-0.5 pt-1 border-t border-hud-border/60">
                {status.problems.slice(0, 4).map((p, i) => (
                  <li key={i} className="text-[10px] text-amber-300/90">▸ {p}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Panel>
      </div>
    </div>
  )
}
