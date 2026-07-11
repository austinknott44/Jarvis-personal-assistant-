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
import LeftColumn from './components/LeftColumn'
import RightColumn from './components/RightColumn'
import PreferencesTab from './components/tabs/PreferencesTab'
import PortfolioTab from './components/tabs/PortfolioTab'
import WorkoutSplitTab from './components/tabs/WorkoutSplitTab'
import AccountTab from './components/tabs/AccountTab'
import FinancialsTab from './components/tabs/FinancialsTab'

type View = 'home' | 'calendar' | 'cleanup' | 'preferences' | 'portfolio' | 'financials' | 'workout' | 'account'

const NAV: { id: View; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'calendar', label: 'Calendar' },
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
  const seqRef = useRef(0)

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
        <nav className="flex gap-1 flex-wrap">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setView(t.id)}
              className={`px-2.5 py-1 text-xs rounded hud-readout uppercase tracking-wide transition-colors
                ${view === t.id ? 'text-hud-cyan bg-hud-cyan/10 border border-hud-cyan/40' : 'text-hud-dim hover:text-hud-text border border-transparent'}`}>
              {t.label}
            </button>
          ))}
        </nav>
        <button onClick={() => setView('home')} title="Home"
          className="hud-readout text-hud-cyan hud-glow tracking-[0.45em] text-2xl font-bold px-4 select-none
                     [text-shadow:0_0_14px_rgba(34,211,238,0.7),0_0_40px_rgba(34,211,238,0.3)]">
          J A R V I S
        </button>
        <div className="flex items-center gap-3 justify-end">
          {approvals.length > 0 && (
            <button onClick={() => setView('home')}
              className="hud-readout text-[10px] text-amber-300 border border-amber-400/50 rounded-full px-2 py-0.5 hud-pulse">
              {approvals.length} pending
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

        {/* main area */}
        <main className="flex-1 min-w-0">
          {view === 'home' && (
            <div className="h-full grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)_380px] gap-3 p-3 overflow-y-auto xl:overflow-hidden">
              {/* LEFT — weather · today agenda · due counts · tomorrow agenda */}
              <div className="overflow-y-auto pr-1 order-2 xl:order-1">
                <LeftColumn refreshKey={refreshKey} />
              </div>

              {/* CENTER — orb + mic + live transcript chat */}
              <div className="flex flex-col items-center min-h-0 order-1 xl:order-2">
                <StarSphere state={orbState} size={Math.min(340, window.innerWidth - 80)} />
                <div className="-mt-5">
                  <MicButton agentOn={agentOn} onOrbState={setOrbState} onTranscript={onTranscript} />
                </div>
                <div className="w-full max-w-2xl flex-1 min-h-56 mt-2">
                  <ChatThread agentOn={agentOn} onThinking={onThinking} greeting={greeting} transcript={transcript} />
                </div>
              </div>

              {/* RIGHT — news · stock squares · agent status (+ approvals on top) */}
              <div className="overflow-y-auto pr-1 order-3 space-y-3">
                {approvals.map((a) => (
                  <ApprovalCard key={a.id} approval={a} onDone={() => { loadApprovals(); setRefreshKey((k) => k + 1) }} />
                ))}
                <RightColumn refreshKey={refreshKey} />
              </div>
            </div>
          )}
          {view === 'calendar' && <CalendarView />}
          {view === 'cleanup' && <CleanupReview />}
          {view === 'preferences' && <PreferencesTab />}
          {view === 'portfolio' && <PortfolioTab />}
          {view === 'financials' && <FinancialsTab />}
          {view === 'workout' && <WorkoutSplitTab />}
          {view === 'account' && <AccountTab />}
        </main>
      </div>
    </div>
  )
}
