// Unified Day/Week/Month calendar — merged Google + Outlook + local events,
// color-coded Personal/Work/School/Clubs. Includes the syllabus drag-drop
// uploader with its mandatory review screen, and a Brightspace sync button.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type HudEvent, type SyllabusExtraction } from '../api'

const CAT_COLORS: Record<string, string> = {
  personal: 'var(--color-cat-personal)',
  work: 'var(--color-cat-work)',
  school: 'var(--color-cat-school)',
  clubs: 'var(--color-cat-clubs)',
}

type ViewMode = 'day' | 'week' | 'month'

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function sameDay(a: Date, b: Date) { return a.toDateString() === b.toDateString() }

export default function CalendarView() {
  const [events, setEvents] = useState<HudEvent[]>([])
  const [mode, setMode] = useState<ViewMode>('week')
  const [anchor, setAnchor] = useState(new Date())
  const [review, setReview] = useState<SyllabusExtraction | null>(null)
  const [uploading, setUploading] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(() => {
    api.calendarEvents(7, 62).then((r) => setEvents(r.events)).catch(() => {})
  }, [])
  useEffect(load, [load])

  const days: Date[] = useMemo(() => {
    const base = startOfDay(anchor)
    if (mode === 'day') return [base]
    if (mode === 'week') {
      const monday = addDays(base, -((base.getDay() + 6) % 7))
      return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
    }
    const first = new Date(base.getFullYear(), base.getMonth(), 1)
    const gridStart = addDays(first, -((first.getDay() + 6) % 7))
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  }, [anchor, mode])

  const eventsFor = (day: Date) =>
    events.filter((e) => e.start_at && sameDay(new Date(e.start_at), day))

  const onUpload = async (file: File) => {
    setUploading(true)
    setNotice('')
    try {
      const result = await api.syllabusUpload(file)
      if (result.error) setNotice(result.error)
      else setReview(result)
    } finally {
      setUploading(false)
    }
  }

  const commitReview = async () => {
    if (!review) return
    const r = await api.syllabusCommit(review)
    setNotice(`Committed ${review.course_name}: ${r.meetings_added} class meeting(s), ${r.deadlines_added} deadline(s).`)
    setReview(null)
    load()
  }

  const syncBrightspace = async () => {
    const r = await api.brightspaceSync()
    setNotice('new' in r ? `Brightspace: ${r.new} new, ${r.updated ?? 0} updated deadline(s).` : 'Brightspace not configured (set BRIGHTSPACE_ICAL_URL).')
  }

  const step = mode === 'day' ? 1 : mode === 'week' ? 7 : 31

  return (
    <div className="h-full flex flex-col p-4 gap-3 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="hud-readout text-hud-cyan text-sm uppercase tracking-widest hud-glow">Calendar</h2>
        <div className="flex rounded overflow-hidden border border-hud-border ml-2">
          {(['day', 'week', 'month'] as ViewMode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-3 py-1 text-xs uppercase hud-readout ${mode === m ? 'bg-hud-cyan/20 text-hud-cyan' : 'text-hud-dim hover:text-hud-text'}`}>
              {m}
            </button>
          ))}
        </div>
        <button onClick={() => setAnchor(addDays(anchor, -step))} className="px-2 text-hud-dim hover:text-hud-cyan">‹</button>
        <span className="text-xs hud-readout">
          {anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric', ...(mode !== 'month' ? { day: 'numeric' } : {}) })}
        </span>
        <button onClick={() => setAnchor(addDays(anchor, step))} className="px-2 text-hud-dim hover:text-hud-cyan">›</button>
        <button onClick={() => setAnchor(new Date())} className="px-2 py-1 text-xs border border-hud-border rounded text-hud-dim hover:text-hud-cyan">today</button>

        <div className="ml-auto flex items-center gap-2">
          <label className={`px-3 py-1 text-xs border border-hud-cyan/40 rounded text-hud-cyan cursor-pointer hover:bg-hud-cyan/10 ${uploading ? 'opacity-50' : ''}`}>
            {uploading ? 'Parsing…' : '+ Upload syllabus PDF'}
            <input type="file" accept=".pdf" className="hidden" disabled={uploading}
              onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
          </label>
          <button onClick={syncBrightspace}
            className="px-3 py-1 text-xs border border-hud-border rounded text-hud-dim hover:text-hud-cyan">
            Sync Brightspace
          </button>
        </div>
      </div>

      <div className="flex gap-3 text-[10px] hud-readout uppercase">
        {Object.entries(CAT_COLORS).map(([cat, color]) => (
          <span key={cat} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} /> {cat}
          </span>
        ))}
      </div>

      {notice && <p className="text-xs text-hud-cyan">{notice}</p>}

      <div className={`flex-1 overflow-y-auto grid gap-1 ${mode === 'day' ? 'grid-cols-1' : mode === 'week' ? 'grid-cols-7' : 'grid-cols-7 auto-rows-fr'}`}>
        {days.map((day) => {
          const todays = eventsFor(day)
          const isToday = sameDay(day, new Date())
          const inMonth = mode !== 'month' || day.getMonth() === anchor.getMonth()
          return (
            <div key={day.toISOString()}
              className={`hud-panel p-1.5 min-h-16 ${!inMonth ? 'opacity-35' : ''} ${isToday ? 'border-hud-cyan/60' : ''}`}>
              <div className={`text-[10px] hud-readout mb-1 ${isToday ? 'text-hud-cyan' : 'text-hud-dim'}`}>
                {mode === 'month' ? day.getDate() : day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
              </div>
              <div className="space-y-0.5">
                {todays.slice(0, mode === 'month' ? 3 : 12).map((e) => (
                  <div key={e.id} title={`${e.title}${e.location ? ' @ ' + e.location : ''} [${e.category}${e.certain ? '' : '?'}]`}
                    className="text-[10px] leading-tight truncate rounded px-1 py-0.5 border-l-2"
                    style={{ borderLeftColor: CAT_COLORS[e.category] ?? '#64748b', background: 'rgba(255,255,255,0.03)' }}>
                    {e.start_at?.length > 10 && <span className="text-hud-dim">{e.start_at.slice(11, 16)} </span>}
                    {e.title}{!e.certain && <span className="text-amber-400"> ?</span>}
                  </div>
                ))}
                {mode === 'month' && todays.length > 3 && (
                  <div className="text-[9px] text-hud-dim">+{todays.length - 3} more</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ---- Syllabus review modal: confirm/edit before anything commits ---- */}
      {review && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="hud-panel max-w-2xl w-full max-h-[85vh] overflow-y-auto p-5">
            <h3 className="hud-readout text-hud-cyan text-sm uppercase mb-3">Review extracted syllabus</h3>
            <label className="text-xs text-hud-dim">Course</label>
            <input value={review.course_name ?? ''}
              onChange={(e) => setReview({ ...review, course_name: e.target.value })}
              className="w-full bg-black/30 border border-hud-border rounded px-2 py-1 text-sm mb-3" />

            <p className="text-xs text-hud-dim mb-1">Class meetings ({review.meetings?.length ?? 0})</p>
            <div className="space-y-1 mb-3">
              {(review.meetings ?? []).map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-black/30 rounded p-2">
                  <span className="flex-1">{m.days?.join('/')} {m.start_time}–{m.end_time} {m.type} {m.location && `@ ${m.location}`}</span>
                  <button onClick={() => setReview({ ...review, meetings: review.meetings!.filter((_, j) => j !== i) })}
                    className="text-red-400 hover:text-red-300">✕</button>
                </div>
              ))}
            </div>

            <p className="text-xs text-hud-dim mb-1">Dated items ({review.dated_items?.length ?? 0})</p>
            <div className="space-y-1 mb-4">
              {(review.dated_items ?? []).map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-black/30 rounded p-2">
                  <span className="flex-1">{d.date} {d.time} — <b>{d.title}</b> ({d.type})</span>
                  <button onClick={() => setReview({ ...review, dated_items: review.dated_items!.filter((_, j) => j !== i) })}
                    className="text-red-400 hover:text-red-300">✕</button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={commitReview}
                className="flex-1 py-2 rounded border border-emerald-500/60 text-emerald-300 text-sm hover:bg-emerald-500/10">
                Commit to calendar + deadlines
              </button>
              <button onClick={() => setReview(null)}
                className="flex-1 py-2 rounded border border-hud-border text-hud-dim text-sm hover:text-hud-text">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
