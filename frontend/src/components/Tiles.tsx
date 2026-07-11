// HUD live tiles: Today's Schedule, Upcoming Deadlines, Portfolio Snapshot,
// Morning Brief, Pending Approvals count, Cleanup summary.
import { useEffect, useState } from 'react'
import { api, type DeadlineItem, type HudEvent, type Portfolio } from '../api'

function Tile({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="hud-panel p-3 min-h-24">
      <h3 className="hud-readout text-[10px] uppercase tracking-widest text-hud-cyan/80 mb-2">{title}</h3>
      <div className="text-xs space-y-1">{children}</div>
    </div>
  )
}

export default function Tiles({ agentOn, refreshKey }: { agentOn: boolean; refreshKey: number }) {
  const [events, setEvents] = useState<HudEvent[]>([])
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([])
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [brief, setBrief] = useState<string>('')
  const [approvalCount, setApprovalCount] = useState(0)

  useEffect(() => {
    api.calendarEvents(0, 1).then((r) => {
      const today = new Date().toDateString()
      setEvents(r.events.filter((e) => e.start_at && new Date(e.start_at).toDateString() === today))
    }).catch(() => {})
    api.deadlines(7).then((r) => setDeadlines(r.deadlines)).catch(() => {})
    api.portfolio().then(setPortfolio).catch(() => {})
    api.brief().then((r) => setBrief(r.text ?? '')).catch(() => {})
    api.approvals().then((r) => setApprovalCount(r.approvals.length)).catch(() => {})
  }, [refreshKey, agentOn])

  return (
    <div className="grid grid-cols-1 gap-3">
      <Tile title="Today's Schedule">
        {events.length === 0 && <p className="text-hud-dim">Nothing scheduled today.</p>}
        {events.slice(0, 5).map((e) => (
          <div key={e.id} className="flex gap-2">
            <span className="hud-readout text-hud-dim">{e.start_at?.length > 10 ? e.start_at.slice(11, 16) : '—'}</span>
            <span className="truncate">{e.title}</span>
          </div>
        ))}
      </Tile>

      <Tile title="Upcoming Deadlines">
        {deadlines.length === 0 && <p className="text-hud-dim">Nothing due this week.</p>}
        {deadlines.slice(0, 5).map((d) => (
          <div key={d.id} className="flex gap-2">
            <span className="hud-readout text-hud-dim">{d.due_at?.slice(5, 10)}</span>
            <span className="truncate">{d.title}{d.course && <span className="text-hud-dim"> · {d.course}</span>}</span>
          </div>
        ))}
      </Tile>

      <Tile title="Portfolio Snapshot">
        {!portfolio?.holdings?.length && <p className="text-hud-dim">No holdings — add them in the Portfolio tab.</p>}
        {portfolio?.total_value != null && (
          <p className="hud-readout text-hud-cyan text-sm">
            ${portfolio.total_value.toLocaleString()}
            {portfolio.total_gain_pct != null && (
              <span className={portfolio.total_gain_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {' '}{portfolio.total_gain_pct >= 0 ? '+' : ''}{portfolio.total_gain_pct}%
              </span>
            )}
          </p>
        )}
        {portfolio?.holdings?.slice(0, 4).map((h) => (
          <div key={h.ticker} className="flex justify-between hud-readout">
            <span>{h.ticker}</span>
            <span className="text-hud-dim">{h.price ? `$${h.price.toFixed(2)}` : `${h.shares} sh`}</span>
          </div>
        ))}
      </Tile>

      <Tile title="Morning Brief">
        {brief
          ? <p className="whitespace-pre-wrap line-clamp-6 text-hud-text">{brief.slice(0, 320)}{brief.length > 320 ? '…' : ''}</p>
          : <p className="text-hud-dim">Generates at 7:00 AM.</p>}
      </Tile>

      <Tile title="Pending Approvals">
        {approvalCount === 0
          ? <p className="text-hud-dim">Nothing waiting on you.</p>
          : <p className="text-amber-300">{approvalCount} action(s) awaiting approval →</p>}
      </Tile>
    </div>
  )
}
