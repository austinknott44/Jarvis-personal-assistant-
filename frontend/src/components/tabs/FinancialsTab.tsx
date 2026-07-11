// Financials tab — the market picture in one place: today's picks with
// reasoning, top gainers/losers/most-active tables, and the deep-analysis
// prompt hand-off. Read-only data; Jarvis has no trade capability.
import { useEffect, useState } from 'react'
import { api, type Movers, type MoverRow, type StockPick, type StrategistBrief } from '../../api'

function MoversTable({ title, rows, tone }: { title: string; rows?: MoverRow[]; tone: string }) {
  return (
    <div className="hud-panel p-3">
      <h3 className={`hud-readout text-[10px] uppercase tracking-widest mb-2 ${tone}`}>{title}</h3>
      <table className="w-full text-xs hud-readout">
        <thead>
          <tr className="text-hud-dim text-left text-[9px] uppercase">
            <th className="pb-1 font-normal">Ticker</th>
            <th className="pb-1 font-normal">Price</th>
            <th className="pb-1 font-normal">Today</th>
            <th className="pb-1 font-normal">Volume</th>
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).slice(0, 8).map((r) => {
            const pct = parseFloat(r.change_pct)
            return (
              <tr key={r.ticker} className="border-t border-hud-border/40">
                <td className="py-1 text-hud-cyan">{r.ticker}</td>
                <td className="py-1">${r.price.toFixed(2)}</td>
                <td className={`py-1 ${pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {pct >= 0 ? '+' : ''}{r.change_pct}%
                </td>
                <td className="py-1 text-hud-dim">{Number(r.volume).toLocaleString()}</td>
              </tr>
            )
          })}
          {!rows?.length && (
            <tr><td colSpan={4} className="py-3 text-center text-hud-dim">No data.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default function FinancialsTab() {
  const [picks, setPicks] = useState<StockPick[]>([])
  const [picksNote, setPicksNote] = useState('')
  const [movers, setMovers] = useState<Movers | null>(null)
  const [strategist, setStrategist] = useState<StrategistBrief | null>(null)
  const [strategistBusy, setStrategistBusy] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.marketPicks().then((r) => { setPicks(r.picks); setPicksNote(r.note ?? '') }).catch(() => {})
    api.marketMovers().then(setMovers).catch(() => {})
    api.strategist().then(setStrategist).catch(() => {})
  }, [])

  const refreshStrategist = async () => {
    setStrategistBusy(true)
    try {
      setStrategist(await api.strategist(true))
    } finally {
      setStrategistBusy(false)
    }
  }

  const getPrompt = async () => {
    const r = await api.deepPrompt()
    setPrompt(r.paste_this ?? r.note ?? '')
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <h2 className="hud-readout text-hud-cyan text-sm uppercase tracking-widest hud-glow">Financials</h2>
      <p className="text-xs text-hud-dim">
        Market snapshot refreshed once per day (Alpha Vantage free tier). Educational only —
        not financial advice, and Jarvis has no ability to trade.
      </p>

      {/* ---- Options strategist desk ---- */}
      <div className="hud-panel p-4 border-l-2 border-l-hud-cyan/60">
        <div className="flex items-center justify-between mb-2">
          <h3 className="hud-readout text-[10px] uppercase tracking-widest text-hud-cyan">Strategist Desk — today's note</h3>
          <button onClick={refreshStrategist} disabled={strategistBusy}
            className="px-2.5 py-1 text-[10px] hud-readout uppercase border border-hud-cyan/40 rounded text-hud-cyan hover:bg-hud-cyan/10 disabled:opacity-40">
            {strategistBusy ? 'Thinking…' : 'Regenerate'}
          </button>
        </div>
        {!strategist && <p className="text-xs text-hud-dim">Loading the desk…</p>}
        {strategist?.note && <p className="text-xs text-amber-300">{strategist.note}</p>}
        {strategist?.brief && (
          <p className="text-sm whitespace-pre-wrap leading-relaxed text-hud-text/95">{strategist.brief}</p>
        )}
        {!!strategist?.chains?.length && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            {strategist.chains.map((c) => (
              <div key={c.ticker} className="bg-black/30 rounded p-2.5">
                <p className="hud-readout text-xs text-hud-cyan mb-1">
                  {c.ticker} options · exp {c.expiry}
                  {c.avg_iv_pct != null && <span className="text-hud-dim"> · IV ≈ {c.avg_iv_pct}%</span>}
                </p>
                <table className="w-full text-[10px] hud-readout">
                  <thead>
                    <tr className="text-hud-dim text-left uppercase text-[8px]">
                      <th className="font-normal">Type</th><th className="font-normal">Strike</th>
                      <th className="font-normal">Last</th><th className="font-normal">Δ</th><th className="font-normal">IV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.contracts.map((o, i) => (
                      <tr key={i} className={o.type === 'call' ? 'text-emerald-300/80' : 'text-red-300/80'}>
                        <td>{o.type}</td><td>{o.strike}</td><td>${o.last.toFixed(2)}</td>
                        <td>{o.delta ?? '—'}</td><td>{o.iv_pct != null ? `${o.iv_pct}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-hud-dim mt-2">
          Strategy education from live data — not financial advice, profits are never guaranteed,
          and Jarvis cannot place trades. You always execute your own decisions.
        </p>
      </div>

      <div>
        <h3 className="hud-readout text-[10px] uppercase tracking-widest text-hud-cyan/80 mb-2">Today's picks & why</h3>
        {picks.length === 0 ? (
          <div className="hud-panel p-3 text-xs text-hud-dim">{picksNote || 'No picks yet — needs ALPHAVANTAGE_API_KEY.'}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {picks.map((p) => {
              const day = parseFloat(p.change_pct)
              return (
                <div key={p.ticker} className="hud-panel p-4">
                  <div className="flex items-baseline gap-2">
                    <span className="hud-readout text-hud-cyan text-lg hud-glow">{p.ticker}</span>
                    <span className="text-xs text-hud-dim truncate">{p.name}</span>
                  </div>
                  <p className="hud-readout text-xl mt-1">${p.price.toFixed(2)}</p>
                  <p className="hud-readout text-xs mt-0.5">
                    <span className={day >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {day >= 0 ? '▲' : '▼'} {p.change_pct}% today
                    </span>
                    {p.week_change_pct != null && (
                      <span className={`ml-2 ${p.week_change_pct >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
                        {p.week_change_pct >= 0 ? '+' : ''}{p.week_change_pct}% 7-day
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-hud-text/90 mt-2 leading-relaxed">{p.why}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <MoversTable title="Top gainers" rows={movers?.gainers} tone="text-emerald-400" />
        <MoversTable title="Top losers" rows={movers?.losers} tone="text-red-400" />
        <MoversTable title="Most active" rows={movers?.most_active} tone="text-hud-cyan/80" />
      </div>
      {movers?.error && <p className="text-xs text-amber-300">{movers.error}</p>}

      <div className="hud-panel p-3 space-y-2">
        <div className="flex items-center gap-2">
          <button onClick={getPrompt}
            className="px-3 py-1.5 text-xs border border-hud-cyan/50 text-hud-cyan rounded hover:bg-hud-cyan/10">
            Deep-analysis prompt for my portfolio
          </button>
          {prompt && (
            <button onClick={() => { navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
              className="px-3 py-1.5 text-xs border border-hud-border rounded text-hud-dim hover:text-hud-cyan">
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          )}
        </div>
        {prompt && <pre className="text-[11px] whitespace-pre-wrap bg-black/30 rounded p-3 max-h-56 overflow-y-auto">{prompt}</pre>}
        <p className="text-[10px] text-hud-dim">Paste into Claude or ChatGPT for the heavy reasoning — Jarvis never automates trade advice.</p>
      </div>
    </div>
  )
}
