// The HUD widget registry. Every home-screen panel is a modular widget that
// HomeGrid can move, resize, hide, or add — new use cases drop in by adding
// an entry to WIDGETS. Data is fetched once per refresh by useHudData and
// shared. Important numbers are rendered large and high-contrast.
import { useEffect, useState } from 'react'
import {
  api, type AgentStatus, type DeadlineItem, type HudEvent, type InboxMsg,
  type NewsResult, type Portfolio, type SplitDay, type StockPick, type Weather,
} from '../api'

export const CAT_COLORS: Record<string, string> = {
  personal: 'var(--color-cat-personal)',
  work: 'var(--color-cat-work)',
  school: 'var(--color-cat-school)',
  clubs: 'var(--color-cat-clubs)',
}

// ---------- shared data ----------

export interface HudData {
  weather: Weather | null
  todayEvents: HudEvent[]
  tomorrowEvents: HudEvent[]
  deadlines: DeadlineItem[]
  inbox: InboxMsg[] | null
  news: NewsResult | null
  picks: StockPick[]
  picksNote: string
  status: AgentStatus | null
  brief: string
  portfolio: Portfolio | null
  workout: SplitDay | null
}

export function useHudData(refreshKey: number): HudData {
  const [data, setData] = useState<HudData>({
    weather: null, todayEvents: [], tomorrowEvents: [], deadlines: [],
    inbox: null, news: null, picks: [], picksNote: '', status: null,
    brief: '', portfolio: null, workout: null,
  })

  useEffect(() => {
    const isAllDay = (e: HudEvent) => !e.start_at || e.start_at.length <= 10
    const dayOf = (e: HudEvent) =>
      isAllDay(e) ? new Date(e.start_at + 'T12:00:00').toDateString() : new Date(e.start_at).toDateString()
    const today = new Date().toDateString()
    const tmr = new Date(Date.now() + 86400000).toDateString()
    const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' })

    api.weather().then((weather) => setData((d) => ({ ...d, weather }))).catch(() => {})
    api.calendarEvents(1, 2).then((r) => setData((d) => ({
      ...d,
      todayEvents: r.events.filter((e) => e.start_at && dayOf(e) === today),
      tomorrowEvents: r.events.filter((e) => e.start_at && dayOf(e) === tmr),
    }))).catch(() => {})
    api.deadlines(7).then((r) => setData((d) => ({ ...d, deadlines: r.deadlines }))).catch(() => {})
    api.inbox().then((r) => setData((d) => ({ ...d, inbox: r.inbox }))).catch(() =>
      setData((d) => ({ ...d, inbox: [] })))
    api.news().then((news) => setData((d) => ({ ...d, news }))).catch(() => {})
    api.marketPicks().then((r) => setData((d) => ({ ...d, picks: r.picks, picksNote: r.note ?? '' }))).catch(() => {})
    api.agentStatus().then((status) => setData((d) => ({ ...d, status }))).catch(() => {})
    api.brief().then((r) => setData((d) => ({ ...d, brief: r.text ?? '' }))).catch(() => {})
    api.portfolio().then((portfolio) => setData((d) => ({ ...d, portfolio }))).catch(() => {})
    api.workout().then((r) => setData((d) => ({
      ...d, workout: r.split.find((s) => s.day === weekday) ?? null,
    }))).catch(() => {})
  }, [refreshKey])

  return data
}

// ---------- building blocks ----------

function isAllDay(e: HudEvent) {
  return !e.start_at || e.start_at.length <= 10
}

function AgendaList({ events, max = 12 }: { events: HudEvent[]; max?: number }) {
  if (events.length === 0) return <p className="text-hud-dim text-sm">Nothing scheduled.</p>
  const allDay = events.filter(isAllDay)
  const timed = events.filter((e) => !isAllDay(e))
  return (
    <div className="space-y-2">
      {allDay.map((e) => (
        <div key={e.id} className="flex gap-2 items-baseline text-sm border-l-2 pl-2 bg-white/[0.03] rounded-r py-1"
             style={{ borderLeftColor: CAT_COLORS[e.category] ?? '#64748b' }}>
          <span className="hud-readout text-hud-cyan/80 shrink-0 text-[10px] uppercase font-semibold">all day</span>
          <span className="truncate text-hud-text">{e.title}</span>
        </div>
      ))}
      {timed.slice(0, max).map((e) => (
        <div key={e.id} className="flex gap-2 items-baseline text-sm border-l-2 pl-2"
             style={{ borderLeftColor: CAT_COLORS[e.category] ?? '#64748b' }}>
          <span className="hud-readout text-hud-cyan/90 shrink-0 w-12 font-medium">{e.start_at.slice(11, 16)}</span>
          <span className="truncate flex-1 text-hud-text">{e.title}</span>
          {e.location && <span className="text-hud-dim text-xs truncate max-w-24">{e.location}</span>}
        </div>
      ))}
      {timed.length > max && <p className="text-xs text-hud-dim">+{timed.length - max} more…</p>}
    </div>
  )
}

// ---------- widget components ----------

function WeatherWidget({ data }: WidgetProps) {
  const weather = data.weather
  if (!weather || weather.error) {
    return <p className="text-hud-dim text-sm">{weather?.error ?? 'Loading…'}</p>
  }
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="text-4xl">{weather.current?.glyph}</span>
        <div>
          <p className="text-4xl hud-readout text-hud-cyan hud-glow font-semibold">{weather.current?.temp}°</p>
          <p className="text-sm text-hud-text">{weather.current?.desc} · feels {weather.current?.feels_like}°</p>
        </div>
        {weather.today && (
          <div className="ml-auto text-right text-sm text-hud-dim leading-relaxed">
            <p className="text-hud-text">H {weather.today.high}° / L {weather.today.low}°</p>
            <p>rain {weather.today.precip_pct}%</p>
            <p>wind {weather.current?.wind_mph} mph</p>
          </div>
        )}
      </div>
      {weather.hours && weather.hours.length > 0 && (
        <div className="flex justify-between mt-3 pt-2 border-t border-hud-border/60">
          {weather.hours.map((h) => (
            <div key={h.time} className="text-center">
              <p className="text-[10px] text-hud-dim hud-readout">{h.time}</p>
              <p className="text-sm">{h.glyph}</p>
              <p className="text-sm hud-readout text-hud-text">{h.temp}°</p>
            </div>
          ))}
        </div>
      )}
      {weather.today && (
        <p className="text-xs text-hud-dim mt-2">sunrise {weather.today.sunrise} · sunset {weather.today.sunset}</p>
      )}
    </>
  )
}

function TodayAgendaWidget({ data }: WidgetProps) {
  return <AgendaList events={data.todayEvents} />
}

function TomorrowAgendaWidget({ data }: WidgetProps) {
  const w = data.weather?.tomorrow
  return (
    <>
      <AgendaList events={data.tomorrowEvents} />
      {w && (
        <p className="text-xs text-hud-dim mt-2 pt-2 border-t border-hud-border/60">
          {w.glyph} {w.desc}, H {w.high}° / L {w.low}°, rain {w.precip_pct}%
        </p>
      )}
    </>
  )
}

function DueWidget({ data }: WidgetProps) {
  const todayStr = new Date().toDateString()
  const dueToday = data.deadlines.filter((d) => d.due_at && new Date(d.due_at).toDateString() === todayStr)
  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="text-center bg-black/25 rounded-lg py-2">
          <p className={`text-5xl hud-readout hud-glow font-semibold ${dueToday.length ? 'text-amber-300' : 'text-hud-cyan'}`}>
            {dueToday.length}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-hud-dim mt-1">Due today</p>
        </div>
        <div className="text-center bg-black/25 rounded-lg py-2">
          <p className="text-5xl hud-readout text-hud-cyan hud-glow font-semibold">{data.deadlines.length}</p>
          <p className="text-[10px] uppercase tracking-widest text-hud-dim mt-1">Due this week</p>
        </div>
      </div>
      <div className="space-y-1.5">
        {data.deadlines.slice(0, 8).map((d) => (
          <div key={d.id} className="flex gap-2 text-sm items-baseline">
            <span className="hud-readout text-hud-cyan/80 shrink-0 text-xs">{d.due_at?.slice(5, 10)}</span>
            <span className="truncate flex-1 text-hud-text">{d.title}</span>
            {d.course && <span className="text-hud-dim text-xs shrink-0">{d.course}</span>}
          </div>
        ))}
        {data.deadlines.length === 0 && <p className="text-hud-dim text-sm">Nothing due this week.</p>}
      </div>
    </>
  )
}

function InboxWidget({ data, onOpenInbox }: WidgetProps) {
  const inbox = data.inbox
  if (inbox === null) return <p className="text-hud-dim text-sm">Loading…</p>
  if (inbox.length === 0) {
    return <p className="text-hud-dim text-sm">No email accounts connected — set them up in Preferences.</p>
  }
  const unread = inbox.filter((m) => m.unread)
  const needsReply = inbox.filter((m) => m.needs_reply)
  return (
    <>
      <div className="flex gap-4 hud-readout text-center mb-3">
        <button onClick={onOpenInbox} className="flex-1 bg-black/25 rounded-lg py-2 hover:bg-hud-cyan/10 transition-colors">
          <p className="text-4xl text-hud-cyan font-semibold">{unread.length}</p>
          <p className="text-[10px] text-hud-dim uppercase mt-0.5">Unread</p>
        </button>
        <button onClick={onOpenInbox} className="flex-1 bg-black/25 rounded-lg py-2 hover:bg-hud-cyan/10 transition-colors">
          <p className={`text-4xl font-semibold ${needsReply.length ? 'text-amber-300' : 'text-hud-cyan'}`}>{needsReply.length}</p>
          <p className="text-[10px] text-hud-dim uppercase mt-0.5">Need reply</p>
        </button>
      </div>
      <div className="space-y-1.5">
        {(needsReply.length ? needsReply : inbox).slice(0, 5).map((m) => (
          <div key={`${m.account}-${m.id}`} className="text-sm truncate">
            <span className="hud-readout text-[10px] uppercase text-hud-dim mr-1.5">{m.account}</span>
            <span className={m.unread ? 'text-hud-text' : 'text-hud-dim'}>{m.subject}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function NewsWidget({ data }: WidgetProps) {
  const news = data.news
  return (
    <>
      {!news && <p className="text-hud-dim text-sm">Loading headlines…</p>}
      {news?.summary && !news.summary.startsWith('(') && (
        <div className="mb-3 pb-3 border-b border-hud-border/60">
          <p className="hud-readout text-[10px] uppercase text-hud-cyan/70 mb-1 font-semibold">Key read</p>
          <p className="text-sm text-hud-text leading-relaxed">{news.summary}</p>
        </div>
      )}
      <div className="space-y-2">
        {news?.headlines?.slice(0, 16).map((h, i) => (
          <a key={i} href={h.link} target="_blank" rel="noreferrer"
             className="block text-sm text-hud-text hover:text-hud-cyan transition-colors leading-snug">
            <span className="text-hud-dim hud-readout text-[10px] uppercase mr-1.5">{h.source.slice(0, 18)}</span>
            {h.title}
          </a>
        ))}
        {news?.note && <p className="text-hud-dim text-sm">{news.note}</p>}
      </div>
    </>
  )
}

function StocksWidget({ data }: WidgetProps) {
  if (data.picks.length === 0) {
    return <p className="text-hud-dim text-sm">{data.picksNote || 'Computing today’s picks…'}</p>
  }
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {data.picks.map((p) => {
          const day = parseFloat(p.change_pct)
          return (
            <div key={p.ticker} className="bg-black/25 rounded-lg p-2.5 flex flex-col gap-0.5">
              <p className="hud-readout text-hud-cyan text-lg hud-glow font-semibold">{p.ticker}</p>
              <p className="text-[11px] text-hud-dim leading-tight">{p.name}</p>
              <p className="hud-readout text-xl text-hud-text mt-0.5 font-medium">${p.price.toFixed(2)}</p>
              <p className={`hud-readout text-xs font-medium ${day >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {day >= 0 ? '▲' : '▼'} {p.change_pct}% today
              </p>
              {p.week_change_pct != null && (
                <p className={`hud-readout text-xs ${p.week_change_pct >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
                  {p.week_change_pct >= 0 ? '+' : ''}{p.week_change_pct}% / 7d
                </p>
              )}
              <p className="text-[10px] text-hud-dim mt-1 leading-snug">{p.why}</p>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-hud-dim mt-2">Educational only — not financial advice. Jarvis cannot trade.</p>
    </>
  )
}

function StatusWidget({ data }: WidgetProps) {
  const status = data.status
  if (!status) return <p className="text-hud-dim text-sm">…</p>
  return (
    <>
      <div className="grid grid-cols-3 gap-2 hud-readout text-center mb-2">
        <div className="bg-black/25 rounded-lg py-2">
          <p className={`text-2xl font-semibold ${status.agent_on ? 'text-hud-cyan' : 'text-hud-dim'}`}>
            {status.agent_on ? 'ON' : 'OFF'}
          </p>
          <p className="text-[10px] text-hud-dim uppercase">Agent</p>
        </div>
        <div className="bg-black/25 rounded-lg py-2">
          <p className="text-2xl text-hud-cyan font-semibold">{status.llm.calls_today}</p>
          <p className="text-[10px] text-hud-dim uppercase">LLM calls</p>
        </div>
        <div className="bg-black/25 rounded-lg py-2">
          <p className={`text-2xl font-semibold ${status.llm.errors_today ? 'text-red-400' : 'text-hud-cyan'}`}>
            {status.llm.errors_today}
          </p>
          <p className="text-[10px] text-hud-dim uppercase">Errors</p>
        </div>
      </div>
      <p className="text-xs text-hud-dim hud-readout mb-1">
        {status.all_clear
          ? <span className="text-emerald-300">✓ All systems nominal</span>
          : <span className="text-amber-300">{status.problems.length} notice(s)</span>}
        {' · '}{status.llm.model}
        {status.pending_approvals > 0 && ` · ${status.pending_approvals} approval(s) pending`}
      </p>
      {status.problems.length > 0 && (
        <ul className="space-y-1 pt-1 border-t border-hud-border/60">
          {status.problems.slice(0, 4).map((p, i) => (
            <li key={i} className="text-xs text-amber-300/90">▸ {p}</li>
          ))}
        </ul>
      )}
    </>
  )
}

function BriefWidget({ data }: WidgetProps) {
  return data.brief
    ? <p className="text-sm whitespace-pre-wrap leading-relaxed text-hud-text">{data.brief}</p>
    : <p className="text-hud-dim text-sm">Generates at 7:00 AM — or ask Jarvis for a brief now.</p>
}

function PortfolioWidget({ data }: WidgetProps) {
  const p = data.portfolio
  if (!p?.holdings?.length) return <p className="text-hud-dim text-sm">No holdings — add them in the Portfolio tab.</p>
  return (
    <>
      {p.total_value != null && (
        <p className="hud-readout text-3xl text-hud-cyan hud-glow font-semibold mb-2">
          ${p.total_value.toLocaleString()}
          {p.total_gain_pct != null && (
            <span className={`text-lg ml-2 ${p.total_gain_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {p.total_gain_pct >= 0 ? '+' : ''}{p.total_gain_pct}%
            </span>
          )}
        </p>
      )}
      <div className="space-y-1.5">
        {p.holdings.slice(0, 6).map((h) => (
          <div key={h.ticker} className="flex justify-between hud-readout text-sm">
            <span className="text-hud-text font-medium">{h.ticker}</span>
            <span className="text-hud-dim">
              {h.price ? `$${h.price.toFixed(2)}` : `${h.shares} sh`}
              {h.change_pct && (
                <span className={parseFloat(h.change_pct) >= 0 ? ' text-emerald-400' : ' text-red-400'}>
                  {' '}{parseFloat(h.change_pct) >= 0 ? '+' : ''}{h.change_pct}%
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

function WorkoutWidget({ data }: WidgetProps) {
  const w = data.workout
  if (!w) return <p className="text-hud-dim text-sm">No split configured — set it in the Workout Split tab or by voice.</p>
  return (
    <>
      <p className="text-2xl hud-readout text-hud-cyan hud-glow font-semibold mb-1">{w.focus}</p>
      <ul className="space-y-1">
        {w.exercises.map((e, i) => (
          <li key={i} className="text-sm text-hud-text">
            {e.name}{e.sets && <span className="hud-readout text-hud-dim"> {e.sets}×{e.reps}</span>}
          </li>
        ))}
        {w.exercises.length === 0 && <li className="text-sm text-hud-dim">Rest day — recover well.</li>}
      </ul>
    </>
  )
}

// ---------- registry ----------

export interface WidgetProps {
  data: HudData
  onOpenInbox: () => void
}

export interface WidgetDef {
  id: string
  title: string
  render: (props: WidgetProps) => React.ReactNode
}

export const WIDGETS: Record<string, WidgetDef> = {
  weather: { id: 'weather', title: 'Weather', render: (p) => <WeatherWidget {...p} /> },
  'today-agenda': { id: 'today-agenda', title: "Today's Agenda", render: (p) => <TodayAgendaWidget {...p} /> },
  due: { id: 'due', title: 'Assignments Due', render: (p) => <DueWidget {...p} /> },
  'tomorrow-agenda': { id: 'tomorrow-agenda', title: "Tomorrow's Agenda", render: (p) => <TomorrowAgendaWidget {...p} /> },
  inbox: { id: 'inbox', title: 'Inbox', render: (p) => <InboxWidget {...p} /> },
  news: { id: 'news', title: 'News & Key Events', render: (p) => <NewsWidget {...p} /> },
  stocks: { id: 'stocks', title: 'Stocks on the Radar', render: (p) => <StocksWidget {...p} /> },
  status: { id: 'status', title: 'Agent Status', render: (p) => <StatusWidget {...p} /> },
  brief: { id: 'brief', title: 'Morning Brief', render: (p) => <BriefWidget {...p} /> },
  portfolio: { id: 'portfolio', title: 'Portfolio Snapshot', render: (p) => <PortfolioWidget {...p} /> },
  workout: { id: 'workout', title: "Today's Workout", render: (p) => <WorkoutWidget {...p} /> },
}
