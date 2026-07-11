// Home HUD left column (fills full height): daily weather → today's agenda
// (all-day events pinned on top) → due-count boxes → due list → tomorrow's
// agenda → inbox summary.
import { useEffect, useState } from 'react'
import { api, type DeadlineItem, type HudEvent, type InboxMsg, type Weather } from '../api'

const CAT_COLORS: Record<string, string> = {
  personal: 'var(--color-cat-personal)',
  work: 'var(--color-cat-work)',
  school: 'var(--color-cat-school)',
  clubs: 'var(--color-cat-clubs)',
}

function Panel({ title, children, grow }: { title: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <div className={`hud-panel p-3 ${grow ? 'flex-1 min-h-28 overflow-y-auto' : ''}`}>
      <h3 className="hud-readout text-[10px] uppercase tracking-widest text-hud-cyan/80 mb-2">{title}</h3>
      {children}
    </div>
  )
}

function isAllDay(e: HudEvent) {
  return !e.start_at || e.start_at.length <= 10
}

function AgendaList({ events, max = 10 }: { events: HudEvent[]; max?: number }) {
  if (events.length === 0) return <p className="text-hud-dim text-xs">Nothing scheduled.</p>
  const allDay = events.filter(isAllDay)
  const timed = events.filter((e) => !isAllDay(e))
  return (
    <div className="space-y-1.5">
      {allDay.map((e) => (
        <div key={e.id} className="flex gap-2 items-baseline text-xs border-l-2 pl-2 bg-white/[0.02] rounded-r py-0.5"
             style={{ borderLeftColor: CAT_COLORS[e.category] ?? '#64748b' }}>
          <span className="hud-readout text-hud-cyan/70 shrink-0 text-[9px] uppercase">all day</span>
          <span className="truncate">{e.title}</span>
        </div>
      ))}
      {timed.slice(0, max).map((e) => (
        <div key={e.id} className="flex gap-2 items-baseline text-xs border-l-2 pl-2"
             style={{ borderLeftColor: CAT_COLORS[e.category] ?? '#64748b' }}>
          <span className="hud-readout text-hud-dim shrink-0 w-10">{e.start_at.slice(11, 16)}</span>
          <span className="truncate flex-1">{e.title}</span>
          {e.location && <span className="text-hud-dim text-[9px] truncate max-w-20">{e.location}</span>}
        </div>
      ))}
      {timed.length > max && <p className="text-[10px] text-hud-dim">+{timed.length - max} more…</p>}
    </div>
  )
}

export default function LeftColumn({ refreshKey, onOpenInbox }: { refreshKey: number; onOpenInbox: () => void }) {
  const [weather, setWeather] = useState<Weather | null>(null)
  const [todayEvents, setTodayEvents] = useState<HudEvent[]>([])
  const [tomorrowEvents, setTomorrowEvents] = useState<HudEvent[]>([])
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([])
  const [inbox, setInbox] = useState<InboxMsg[] | null>(null)

  useEffect(() => {
    api.weather().then(setWeather).catch(() => {})
    // days_back=1 so events from earlier today still show on the agenda
    api.calendarEvents(1, 2).then((r) => {
      const today = new Date().toDateString()
      const tmr = new Date(Date.now() + 86400000).toDateString()
      const dayOf = (e: HudEvent) =>
        isAllDay(e) ? new Date(e.start_at + 'T12:00:00').toDateString() : new Date(e.start_at).toDateString()
      setTodayEvents(r.events.filter((e) => e.start_at && dayOf(e) === today))
      setTomorrowEvents(r.events.filter((e) => e.start_at && dayOf(e) === tmr))
    }).catch(() => {})
    api.deadlines(7).then((r) => setDeadlines(r.deadlines)).catch(() => {})
    api.inbox().then((r) => setInbox(r.inbox)).catch(() => setInbox([]))
  }, [refreshKey])

  const todayStr = new Date().toDateString()
  const dueToday = deadlines.filter((d) => d.due_at && new Date(d.due_at).toDateString() === todayStr)
  const needsReply = (inbox ?? []).filter((m) => m.needs_reply)
  const unread = (inbox ?? []).filter((m) => m.unread)

  return (
    <div className="h-full flex flex-col gap-3">
      {/* ---- Daily weather ---- */}
      <Panel title={`Weather · ${weather?.city ?? '—'}`}>
        {!weather || weather.error ? (
          <p className="text-hud-dim text-xs">{weather?.error ?? 'Loading…'}</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{weather.current?.glyph}</span>
              <div>
                <p className="text-2xl hud-readout text-hud-cyan hud-glow">{weather.current?.temp}°F</p>
                <p className="text-xs text-hud-dim">{weather.current?.desc} · feels {weather.current?.feels_like}°</p>
              </div>
              {weather.today && (
                <div className="ml-auto text-right text-xs text-hud-dim">
                  <p>H {weather.today.high}° / L {weather.today.low}°</p>
                  <p>rain {weather.today.precip_pct}%</p>
                  <p>wind {weather.current?.wind_mph} mph</p>
                </div>
              )}
            </div>
            {weather.hours && weather.hours.length > 0 && (
              <div className="flex justify-between mt-2 pt-2 border-t border-hud-border/60">
                {weather.hours.map((h) => (
                  <div key={h.time} className="text-center">
                    <p className="text-[9px] text-hud-dim hud-readout">{h.time}</p>
                    <p className="text-xs">{h.glyph}</p>
                    <p className="text-[10px] hud-readout">{h.temp}°</p>
                  </div>
                ))}
              </div>
            )}
            {weather.today && (
              <p className="text-[10px] text-hud-dim mt-1.5">
                sunrise {weather.today.sunrise} · sunset {weather.today.sunset}
              </p>
            )}
          </>
        )}
      </Panel>

      {/* ---- Today's agenda (grows) ---- */}
      <Panel title="Today's Agenda" grow>
        <AgendaList events={todayEvents} max={12} />
      </Panel>

      {/* ---- Due counters + list ---- */}
      <div className="grid grid-cols-2 gap-3">
        <div className="hud-panel p-3 text-center">
          <p className={`text-3xl hud-readout hud-glow ${dueToday.length ? 'text-amber-300' : 'text-hud-cyan'}`}>
            {dueToday.length}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-hud-dim mt-1">Due today</p>
        </div>
        <div className="hud-panel p-3 text-center">
          <p className="text-3xl hud-readout text-hud-cyan hud-glow">{deadlines.length}</p>
          <p className="text-[10px] uppercase tracking-widest text-hud-dim mt-1">Due this week</p>
        </div>
      </div>
      {deadlines.length > 0 && (
        <div className="hud-panel p-3 space-y-1 max-h-36 overflow-y-auto">
          {deadlines.map((d) => (
            <div key={d.id} className="flex gap-2 text-xs">
              <span className="hud-readout text-hud-dim shrink-0">{d.due_at?.slice(5, 10)}</span>
              <span className="truncate flex-1">{d.title}</span>
              {d.course && <span className="text-hud-dim text-[9px] shrink-0">{d.course}</span>}
            </div>
          ))}
        </div>
      )}

      {/* ---- Tomorrow's agenda (grows) ---- */}
      <Panel title="Tomorrow's Agenda" grow>
        <AgendaList events={tomorrowEvents} max={10} />
        {weather?.tomorrow && (
          <p className="text-[10px] text-hud-dim mt-2 pt-2 border-t border-hud-border/60">
            {weather.tomorrow.glyph} {weather.tomorrow.desc}, H {weather.tomorrow.high}° / L {weather.tomorrow.low}°, rain {weather.tomorrow.precip_pct}%
          </p>
        )}
      </Panel>

      {/* ---- Inbox summary ---- */}
      <div className="hud-panel p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="hud-readout text-[10px] uppercase tracking-widest text-hud-cyan/80">Inbox</h3>
          <button onClick={onOpenInbox}
            className="text-[10px] hud-readout text-hud-dim hover:text-hud-cyan uppercase">open →</button>
        </div>
        {inbox === null ? (
          <p className="text-hud-dim text-xs">Loading…</p>
        ) : inbox.length === 0 ? (
          <p className="text-hud-dim text-xs">No email accounts connected — set them up in Preferences.</p>
        ) : (
          <>
            <div className="flex gap-4 hud-readout text-center mb-2">
              <div className="flex-1">
                <p className="text-xl text-hud-cyan">{unread.length}</p>
                <p className="text-[9px] text-hud-dim uppercase">Unread</p>
              </div>
              <div className="flex-1">
                <p className={`text-xl ${needsReply.length ? 'text-amber-300' : 'text-hud-cyan'}`}>{needsReply.length}</p>
                <p className="text-[9px] text-hud-dim uppercase">Need reply</p>
              </div>
            </div>
            <div className="space-y-1">
              {(needsReply.length ? needsReply : inbox).slice(0, 4).map((m) => (
                <div key={`${m.account}-${m.id}`} className="text-xs truncate">
                  <span className="hud-readout text-[9px] uppercase text-hud-dim mr-1">{m.account}</span>
                  <span className={m.unread ? 'text-hud-text' : 'text-hud-dim'}>{m.subject}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
