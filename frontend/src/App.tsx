// Jarvis HUD shell — left nav (Home/Calendar/Cleanup), top tabs (Preferences/
// Portfolio/Workout Split/Account), master toggle, orb + chat + tiles +
// approval tray.
import { useCallback, useEffect, useState } from 'react'
import { api, type ApprovalItem } from './api'
import StarSphere, { type OrbState } from './components/StarSphere'
import ChatThread from './components/ChatThread'
import MicButton from './components/MicButton'
import MasterToggle from './components/MasterToggle'
import ApprovalCard from './components/ApprovalCard'
import CalendarView from './components/CalendarView'
import CleanupReview from './components/CleanupReview'
import Tiles from './components/Tiles'
import PreferencesTab from './components/tabs/PreferencesTab'
import PortfolioTab from './components/tabs/PortfolioTab'
import WorkoutSplitTab from './components/tabs/WorkoutSplitTab'
import AccountTab from './components/tabs/AccountTab'

type View = 'home' | 'calendar' | 'cleanup' | 'preferences' | 'portfolio' | 'workout' | 'account'

const NAV: { id: View; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'cleanup', label: 'Cleanup Review' },
]
const TABS: { id: View; label: string }[] = [
  { id: 'preferences', label: 'Preferences' },
  { id: 'portfolio', label: 'Portfolio' },
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
      {/* top bar */}
      <header className="flex items-center gap-4 px-4 py-2 border-b border-hud-border shrink-0">
        <span className="hud-readout text-hud-cyan hud-glow tracking-[0.3em] text-sm">J A R V I S</span>
        <nav className="flex gap-1 ml-4">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setView(t.id)}
              className={`px-3 py-1 text-xs rounded hud-readout uppercase tracking-wide transition-colors
                ${view === t.id ? 'text-hud-cyan bg-hud-cyan/10 border border-hud-cyan/40' : 'text-hud-dim hover:text-hud-text border border-transparent'}`}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
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
        <aside className="w-40 border-r border-hud-border p-2 space-y-1 shrink-0 hidden sm:block">
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
            <div className="h-full flex flex-col lg:flex-row gap-4 p-4 overflow-y-auto lg:overflow-hidden">
              <div className="flex flex-col items-center lg:flex-1 min-h-0">
                <StarSphere state={orbState} size={Math.min(380, window.innerWidth - 80)} />
                <div className="flex items-center gap-6 -mt-6">
                  <MicButton agentOn={agentOn} onOrbState={setOrbState} />
                </div>
                <div className="w-full max-w-xl flex-1 min-h-48 mt-2">
                  <ChatThread agentOn={agentOn} onThinking={onThinking} greeting={greeting} />
                </div>
              </div>
              <div className="lg:w-80 shrink-0 space-y-3 overflow-y-auto pb-4">
                {approvals.map((a) => (
                  <ApprovalCard key={a.id} approval={a} onDone={() => { loadApprovals(); setRefreshKey((k) => k + 1) }} />
                ))}
                <Tiles agentOn={agentOn} refreshKey={refreshKey} />
              </div>
            </div>
          )}
          {view === 'calendar' && <CalendarView />}
          {view === 'cleanup' && <CleanupReview />}
          {view === 'preferences' && <PreferencesTab />}
          {view === 'portfolio' && <PortfolioTab />}
          {view === 'workout' && <WorkoutSplitTab />}
          {view === 'account' && <AccountTab />}
        </main>
      </div>
    </div>
  )
}
