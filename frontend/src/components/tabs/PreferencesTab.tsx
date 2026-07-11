// Preferences — connect email accounts (OAuth "Connect" for Gmail/Outlook;
// iCloud app-password stored encrypted locally) and see integration status.
// The UI distinguishes "Connected via secure login" vs "app password,
// encrypted locally" per CLAUDE.md §7.
import { useCallback, useEffect, useState } from 'react'
import { api, type Health } from '../../api'

export default function PreferencesTab() {
  const [health, setHealth] = useState<Health | null>(null)
  const [icloud, setIcloud] = useState({ email: '', password: '' })
  const [msFlow, setMsFlow] = useState<{ code?: string; uri?: string } | null>(null)
  const [notice, setNotice] = useState('')

  const load = useCallback(() => { api.health().then(setHealth).catch(() => {}) }, [])
  useEffect(load, [load])

  const integ = health?.integrations ?? {}

  const connectGoogle = async () => {
    setNotice('A Google consent window should open on the machine running the backend…')
    const r = await api.googleConnect()
    setNotice(r.error ?? 'Google connected — Calendar + Gmail are live.')
    load()
  }

  const connectOutlook = async () => {
    const r = await api.outlookConnect()
    if (r.error) { setNotice(r.error); return }
    setMsFlow({ code: r.user_code, uri: r.verification_uri })
    const poll = await api.outlookPoll()
    setNotice(poll.error ?? 'Outlook connected.')
    setMsFlow(null)
    load()
  }

  const saveIcloud = async () => {
    const r = await api.icloudSave(icloud.email, icloud.password)
    setNotice(r.error ?? `iCloud saved — ${r.note ?? ''}`)
    setIcloud({ email: '', password: '' })
    load()
  }

  const Status = ({ ok, okLabel = 'connected', badLabel = 'not configured' }:
    { ok?: boolean; okLabel?: string; badLabel?: string }) => (
    <span className={`hud-readout text-[10px] uppercase px-1.5 py-0.5 rounded border
      ${ok ? 'text-emerald-300 border-emerald-500/50' : 'text-hud-dim border-hud-border'}`}>
      {ok ? okLabel : badLabel}
    </span>
  )

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 max-w-3xl">
      <h2 className="hud-readout text-hud-cyan text-sm uppercase tracking-widest hud-glow">Preferences</h2>
      {notice && <p className="text-xs text-hud-cyan">{notice}</p>}

      <div className="hud-panel p-4 space-y-3">
        <h3 className="hud-readout text-xs uppercase text-hud-cyan/80">Email accounts</h3>

        <div className="flex items-center gap-3 text-sm">
          <span className="w-24">Gmail</span>
          <Status ok={integ.google} okLabel="secure login" />
          <button onClick={connectGoogle} disabled={!integ.google_configured}
            className="ml-auto px-3 py-1 text-xs border border-hud-cyan/50 text-hud-cyan rounded hover:bg-hud-cyan/10 disabled:opacity-30">
            {integ.google ? 'Reconnect' : 'Connect'}
          </button>
        </div>
        {!integ.google_configured && (
          <p className="text-[10px] text-hud-dim pl-24">Set GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET in .env first (see WALKTHROUGH B2.1).</p>
        )}

        <div className="flex items-center gap-3 text-sm">
          <span className="w-24">Outlook (.edu)</span>
          <Status ok={integ.outlook} okLabel="secure login" />
          <button onClick={connectOutlook} disabled={!integ.outlook_configured}
            className="ml-auto px-3 py-1 text-xs border border-hud-cyan/50 text-hud-cyan rounded hover:bg-hud-cyan/10 disabled:opacity-30">
            {integ.outlook ? 'Reconnect' : 'Connect'}
          </button>
        </div>
        {msFlow && (
          <p className="text-xs bg-black/30 rounded p-2">
            Go to <b>{msFlow.uri}</b> and enter code <b className="text-hud-cyan hud-readout">{msFlow.code}</b>. Waiting…
          </p>
        )}
        {!integ.outlook_configured && (
          <p className="text-[10px] text-hud-dim pl-24">Set MS_CLIENT_ID in .env. Purdue may block third-party apps — that's expected; Jarvis degrades gracefully.</p>
        )}

        <div className="flex items-start gap-3 text-sm">
          <span className="w-24 pt-1.5">iCloud</span>
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <Status ok={integ.icloud} okLabel="app password, encrypted locally" badLabel="not set up" />
              <span className="text-[10px] text-hud-dim">read-only in this build</span>
            </div>
            <input value={icloud.email} onChange={(e) => setIcloud({ ...icloud, email: e.target.value })}
              placeholder="you@icloud.com"
              className="w-full bg-black/30 border border-hud-border rounded px-2 py-1 text-xs" />
            <input type="password" value={icloud.password}
              onChange={(e) => setIcloud({ ...icloud, password: e.target.value })}
              placeholder="app-specific password (appleid.apple.com)"
              className="w-full bg-black/30 border border-hud-border rounded px-2 py-1 text-xs" />
            <button onClick={saveIcloud} disabled={!icloud.email || !icloud.password}
              className="px-3 py-1 text-xs border border-hud-cyan/50 text-hud-cyan rounded hover:bg-hud-cyan/10 disabled:opacity-30">
              Save (encrypted at rest)
            </button>
          </div>
        </div>
      </div>

      <div className="hud-panel p-4 space-y-2">
        <h3 className="hud-readout text-xs uppercase text-hud-cyan/80">Integrations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 text-sm">
          {([
            ['Gemini brain', 'gemini', 'https://aistudio.google.com/apikey'],
            ['Brightspace iCal', 'brightspace', 'https://purdue.brightspace.com'],
            ['Alpha Vantage', 'alphavantage', 'https://www.alphavantage.co/support/#api-key'],
            ['ntfy pushes', 'ntfy', 'https://ntfy.sh'],
            ['Mealie', 'mealie', null],
            ['wger', 'wger', null],
            ['RSS news', 'rss', null],
          ] as const).map(([label, key, url]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-32 text-xs">{label}</span>
              <Status ok={integ[key]} />
              {url && !integ[key] && (
                <a href={url} target="_blank" rel="noreferrer"
                   className="text-[10px] text-hud-cyan/80 hover:text-hud-cyan underline underline-offset-2">
                  get key
                </a>
              )}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-hud-dim">
          Every key is free — SETUP_APIS.md in the repo has step-by-step links for all of them.
          Keys go in .env; the Agent Status tile on Home shows anything still missing.
          Weather (Open-Meteo) and news (Google News/BBC) need no keys at all.
        </p>
      </div>
    </div>
  )
}
