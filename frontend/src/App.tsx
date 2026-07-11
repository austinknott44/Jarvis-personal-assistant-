// Jarvis HUD shell. Home layout: left = weather / today's agenda / due
// counters / tomorrow's agenda · center = orb + live transcript chat ·
// right = news & key events / three daily stock squares / agent status.
// JARVIS wordmark sits centered in the top bar.
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ApprovalItem } from './api'
import StarSphere, { type OrbState } from './components/StarSphere'
import ChatThread, { type TranscriptChunk } from './components/ChatThread'
import MicButton from './components/MicButton'
import MasterToggle from './components/MasterToggle'
import ApprovalCard from './components/ApprovalCard'
import CalendarView from './components/CalendarView'
import CleanupReview from './components/CleanupReview'
import InboxView from './components/InboxView'
import HomeGrid from './components/HomeGrid'
import { useHudData } from './components/widgets'
import PreferencesTab from './components/tabs/PreferencesTab'
import PortfolioTab from './components/tabs/PortfolioTab'
import WorkoutSplitTab from './components/tabs/WorkoutSplitTab'
import AccountTab from './components/tabs/AccountTab'
import FinancialsTab from './components/tabs/FinancialsTab'

type View = 'home' | 'calendar' | 'inbox' | 'cleanup' | 'preferences' | 'portfolio' | 'financials' | 'workout' | 'account'

const NAV: { id: View; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'cleanup', label: 'Cleanup Review' },
]
const TABS: { id: View; label: string }[] = [
  { id: 'preferences', label: 'Preferences' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'financials', label: 'Financials' },
  { id: 'workout', label: 'Workout Split' },
  { id: 'account', label: 'Account' },
]

export default function App() {
  const [view, setView] = useState<View>('home')
  const [agentOn, setAgentOn] = useState(false)
  const [toggleBusy, setToggleBusy] = useState(false)
  const [orbState, setOrbState] = useState<OrbState>('off')
  const [greeting, setGreeting] = useState<string | null>(null)
  const [approvals, setApprovals] = useState<ApprovalItem[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [transcript, setTranscript] = useState<TranscriptChunk | null>(null)
  const [editingLayout, setEditingLayout] = useState(false)
  const seqRef = useRef(0)
  const hudData = useHudData(refreshKey)

  const onTranscript = useCallback((role: string, text: string, turnComplete?: boolean) => {
    setTranscript({ seq: ++seqRef.current, role, text, turnComplete })
  }, [])

  const loadApprovals = useCallback(() => {
    api.approvals().then((r) => setApprovals(r.approvals)).catch(() => {})
  }, [])

  useEffect(() => {
    api.health().then((h) => {
      setAgentOn(h.agent_on)
      setOrbState(h.agent_on ? 'idle' : 'off')
    }).catch(() => {})
    loadApprovals()
  }, [loadApprovals])

  // Poll approvals only while ON (off = dormant, no polling)
  useEffect(() => {
    if (!agentOn) return
    const t = setInterval(loadApprovals, 15000)
    return () => clearInterval(t)
  }, [agentOn, loadApprovals])

  const toggle = async (next: boolean) => {
    setToggleBusy(true)
    try {
      if (next) {
        setOrbState('thinking')
        const r = await api.agentStart()
        setAgentOn(true)
        setOrbState('idle')
        setGreeting(r.greeting)
      } else {
        await api.agentStop()
        setAgentOn(false)
        setOrbState('off')
      }
      setRefreshKey((k) => k + 1)
    } catch {
      setOrbState(agentOn ? 'idle' : 'off')
    } finally {
      setToggleBusy(false)
    }
  }

  const onThinking = (thinking: boolean) => {
    setOrbState(thinking ? 'thinking' : agentOn ? 'idle' : 'off')
    if (!thinking) { loadApprovals(); setRefreshKey((k) => k + 1) }
  }

  return (
    <div className="h-full flex flex-col relative z-10">
      {/* top bar — JARVIS wordmark centered */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2 border-b border-hud-border shrink-0">
        <nav className="flex gap-1 overflow-x-auto whitespace-nowrap [-webkit-overflow-scrolling:touch]">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setView(t.id)}
              className={`px-2.5 py-1 text-xs rounded hud-readout uppercase tracking-wide transition-colors
                ${view === t.id ? 'text-hud-cyan bg-hud-cyan/10 border border-hud-cyan/40' : 'text-hud-dim hover:text-hud-text border border-transparent'}`}>
              {t.label}
            </button>
          ))}
        </nav>
        <button onClick={() => setView('home')} title="Home"
          className="hud-readout text-hud-cyan hud-glow tracking-[0.3em] sm:tracking-[0.45em] text-lg sm:text-2xl font-bold px-2 sm:px-4 select-none
                     [text-shadow:0_0_14px_rgba(34,211,238,0.7),0_0_40px_rgba(34,211,238,0.3)]">
          J A R V I S
        </button>
        <div className="flex items-center gap-2 justify-end">
          {approvals.length > 0 && (
            <button onClick={() => setView('home')}
              className="hud-readout text-[10px] text-amber-300 border border-amber-400/50 rounded-full px-2 py-0.5 hud-pulse">
              {approvals.length} pending
            </button>
          )}
          {view === 'home' && (
            <button onClick={() => setEditingLayout((e) => !e)}
              title="Rearrange, resize, add, or remove home-screen modules"
              className={`hud-readout text-[10px] uppercase px-2 py-1 rounded border transition-colors
                ${editingLayout ? 'text-hud-cyan border-hud-cyan/60 bg-hud-cyan/10' : 'text-hud-dim border-hud-border hover:text-hud-cyan'}`}>
              {editingLayout ? 'Done' : 'Edit layout'}
            </button>
          )}
          <MasterToggle on={agentOn} busy={toggleBusy} onChange={toggle} />
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* left nav */}
        <aside className="w-36 border-r border-hud-border p-2 space-y-1 shrink-0 hidden md:block">
          {NAV.map((n) => (
            <button key={n.id} onClick={() => setView(n.id)}
              className={`w-full text-left px-3 py-2 text-xs rounded hud-readout uppercase tracking-wide transition-colors
                ${view === n.id ? 'text-hud-cyan bg-hud-cyan/10 border border-hud-cyan/40' : 'text-hud-dim hover:text-hud-text border border-transparent'}`}>
              {n.label}
            </button>
          ))}
        </aside>

        {/* main area — bottom padding clears the mobile nav bar */}
        <main className="flex-1 min-w-0 pb-14 md:pb-0">
          {view === 'home' && (
            <div className="h-full grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)_420px] gap-3 p-3 pb-20 md:pb-3 overflow-y-auto xl:overflow-hidden">
              {/* LEFT — customizable widget column */}
              <div className="xl:h-full xl:overflow-y-auto pr-1 order-2 xl:order-1">
                <HomeGrid data={hudData} side="left" editing={editingLayout}
                          onOpenInbox={() => setView('inbox')} />
              </div>

              {/* CENTER — orb at true vertical center, live transcript below */}
              <div className="grid grid-rows-[1fr_auto_1fr] justify-items-center min-h-[34rem] xl:min-h-0 order-1 xl:order-2">
                <div /> {/* symmetric spacer so the sphere sits at the exact center */}
                <div className="relative">
                  <StarSphere state={orbState} size={Math.min(460, window.innerWidth - 48)} />
                  <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10">
                    <MicButton agentOn={agentOn} onOrbState={setOrbState} onTranscript={onTranscript} />
                  </div>
                </div>
                <div className="w-full max-w-2xl min-h-0 pt-10 pb-1">
                  <ChatThread agentOn={agentOn} onThinking={onThinking} greeting={greeting} transcript={transcript} />
                </div>
              </div>

              {/* RIGHT — customizable widget column (approvals always pinned on top) */}
              <div className="xl:h-full xl:overflow-y-auto pr-1 order-3 space-y-3">
                {approvals.map((a) => (
                  <ApprovalCard key={a.id} approval={a} onDone={() => { loadApprovals(); setRefreshKey((k) => k + 1) }} />
                ))}
                <HomeGrid data={hudData} side="right" editing={editingLayout}
                          onOpenInbox={() => setView('inbox')} />
              </div>
            </div>
          )}
          {view === 'inbox' && <InboxView />}
          {view === 'calendar' && <CalendarView />}
          {view === 'cleanup' && <CleanupReview />}
          {view === 'preferences' && <PreferencesTab />}
          {view === 'portfolio' && <PortfolioTab />}
          {view === 'financials' && <FinancialsTab />}
          {view === 'workout' && <WorkoutSplitTab />}
          {view === 'account' && <AccountTab />}
        </main>
      </div>

      {/* iPhone bottom nav — fixed, thumb-reachable, hidden on desktop */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-hud-border
                      bg-hud-bg/90 backdrop-blur flex justify-around items-stretch
                      pb-[env(safe-area-inset-bottom)]">
        {([
          ['home', 'Home', '◉'],
          ['calendar', 'Calendar', '▦'],
          ['inbox', 'Inbox', '✉'],
          ['financials', 'Markets', '☰'],
          ['cleanup', 'Cleanup', '♻'],
        ] as [View, string, string][]).map(([id, label, glyph]) => (
          <button key={id} onClick={() => setView(id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] hud-readout uppercase
              ${view === id ? 'text-hud-cyan' : 'text-hud-dim'}`}>
            <span className="text-lg leading-none">{glyph}</span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
