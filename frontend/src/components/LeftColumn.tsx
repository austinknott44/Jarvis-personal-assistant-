// Home HUD left column: daily weather → today's agenda → due-count boxes
// (today / this week) → tomorrow's agenda.
import { useEffect, useState } from 'react'
import { api, type DeadlineItem, type HudEvent, type Weather } from '../api'

const CAT_COLORS: Record<string, string> = {
  personal: 'var(--color-cat-personal)',
  work: 'var(--color-cat-work)',
  school: 'var(--color-cat-school)',
  clubs: 'var(--color-cat-clubs)',
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="hud-panel p-3">
      <h3 className="hud-readout text-[10px] uppercase tracking-widest text-hud-cyan/80 mb-2">{title}</h3>
      {children}
    </div>
  )
}

function AgendaList({ events }: { events: HudEvent[] }) {
  if (events.length === 0) return <p className="text-hud-dim text-xs">Nothing scheduled.</p>
  return (
    <div className="space-y-1.5">
      {events.slice(0, 8).map((e) => (
        <div key={e.id} className="flex gap-2 items-baseline text-xs border-l-2 pl-2"
             style={{ borderLeftColor: CAT_COLORS[e.category] ?? '#64748b' }}>
          <span className="hud-readout text-hud-dim shrink-0 w-10">
            {e.start_at?.length > 10 ? e.start_at.slice(11, 16) : 'all day'}
          </span>
          <span className="truncate">{e.title}</span>
        </div>
      ))}
    </div>
  )
}

export default function LeftColumn({ refreshKey }: { refreshKey: number }) {
  const [weather, setWeather] = useState<Weather | null>(null)
  const [todayEvents, setTodayEvents] = useState<HudEvent[]>([])
  const [tomorrowEvents, setTomorrowEvents] = useState<HudEvent[]>([])
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([])

  useEffect(() => {
    api.weather().then(setWeather).catch(() => {})
    // days_back=1 so events from earlier today still show on the agenda
    api.calendarEvents(1, 2).then((r) => {
      const today = new Date().toDateString()
      const tmr = new Date(Date.now() + 86400000).toDateString()
      setTodayEvents(r.events.filter((e) => e.start_at && new Date(e.start_at).toDateString() === today))
      setTomorrowEvents(r.events.filter((e) => e.start_at && new Date(e.start_at).toDateString() === tmr))
    }).catch(() => {})
    api.deadlines(7).then((r) => setDeadlines(r.deadlines)).catch(() => {})
  }, [refreshKey])

  const todayStr = new Date().toDateString()
  const dueToday = deadlines.filter((d) => d.due_at && new Date(d.due_at).toDateString() === todayStr)
  const dueWeek = deadlines

  return (
    <div className="space-y-3">
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
          </>
        )}
      </Panel>

      {/* ---- Today's agenda ---- */}
      <Panel title="Today's Agenda">
        <AgendaList events={todayEvents} />
      </Panel>

      {/* ---- Due counters ---- */}
      <div className="grid grid-cols-2 gap-3">
        <div className="hud-panel p-3 text-center">
          <p className={`text-3xl hud-readout hud-glow ${dueToday.length ? 'text-amber-300' : 'text-hud-cyan'}`}>
            {dueToday.length}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-hud-dim mt-1">Due today</p>
        </div>
        <div className="hud-panel p-3 text-center">
          <p className="text-3xl hud-readout text-hud-cyan hud-glow">{dueWeek.length}</p>
          <p className="text-[10px] uppercase tracking-widest text-hud-dim mt-1">Due this week</p>
        </div>
      </div>
      {dueWeek.length > 0 && (
        <div className="hud-panel p-3 space-y-1">
          {dueWeek.slice(0, 5).map((d) => (
            <div key={d.id} className="flex gap-2 text-xs">
              <span className="hud-readout text-hud-dim shrink-0">{d.due_at?.slice(5, 10)}</span>
              <span className="truncate">{d.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* ---- Tomorrow's agenda ---- */}
      <Panel title="Tomorrow's Agenda">
        <AgendaList events={tomorrowEvents} />
        {weather?.tomorrow && (
          <p className="text-[10px] text-hud-dim mt-2 pt-2 border-t border-hud-border/60">
            {weather.tomorrow.glyph} {weather.tomorrow.desc}, H {weather.tomorrow.high}° / L {weather.tomorrow.low}°, rain {weather.tomorrow.precip_pct}%
          </p>
        )}
      </Panel>
    </div>
  )
}
