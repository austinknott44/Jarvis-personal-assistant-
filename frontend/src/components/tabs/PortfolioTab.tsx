// Portfolio tab — edit holdings by hand (voice edits write to the same
// table). Read-only data: there is no trading anywhere in Jarvis.
import { useCallback, useEffect, useState } from 'react'
import { api, type Portfolio } from '../../api'

export default function PortfolioTab() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [form, setForm] = useState({ ticker: '', shares: '', cost_basis: '', target_pct: '' })
  const [prompt, setPrompt] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => { api.portfolio().then(setPortfolio).catch(() => {}) }, [])
  useEffect(load, [load])

  const save = async () => {
    if (!form.ticker || !form.shares) return
    await api.setHolding({
      ticker: form.ticker,
      shares: parseFloat(form.shares),
      cost_basis: parseFloat(form.cost_basis || '0'),
      target_pct: parseFloat(form.target_pct || '0'),
    })
    setForm({ ticker: '', shares: '', cost_basis: '', target_pct: '' })
    load()
  }

  const remove = async (ticker: string) => {
    await api.setHolding({ ticker, shares: 0, cost_basis: 0, target_pct: 0 })
    load()
  }

  const getPrompt = async () => {
    const r = await api.deepPrompt()
    setPrompt(r.paste_this ?? r.note ?? '')
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <h2 className="hud-readout text-hud-cyan text-sm uppercase tracking-widest hud-glow">Portfolio</h2>
      <p className="text-xs text-hud-dim">
        Robinhood has no official read API — enter positions manually (or by voice:
        “set my NVDA position to 12 shares”). Prices come from Alpha Vantage.
        Jarvis can never trade. Not financial advice.
      </p>

      <div className="hud-panel p-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          {(['ticker', 'shares', 'cost_basis', 'target_pct'] as const).map((f) => (
            <input key={f} placeholder={f.replace('_', ' ')}
              value={form[f]}
              onChange={(e) => setForm({ ...form, [f]: e.target.value })}
              className="bg-black/30 border border-hud-border rounded px-2 py-1.5 focus:outline-none focus:border-hud-cyan/60" />
          ))}
          <button onClick={save}
            className="border border-hud-cyan/50 text-hud-cyan rounded hover:bg-hud-cyan/10 py-1.5">
            Save position
          </button>
        </div>
      </div>

      <div className="hud-panel overflow-x-auto">
        <table className="w-full text-xs hud-readout">
          <thead>
            <tr className="text-hud-dim text-left border-b border-hud-border">
              {['Ticker', 'Shares', 'Cost', 'Price', 'Value', 'Gain', 'Target %', 'Actual %', ''].map((h) => (
                <th key={h} className="px-3 py-2 font-normal uppercase text-[10px]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {portfolio?.holdings.map((h) => (
              <tr key={h.ticker} className="border-b border-hud-border/40">
                <td className="px-3 py-2 text-hud-cyan">{h.ticker}</td>
                <td className="px-3 py-2">{h.shares}</td>
                <td className="px-3 py-2">${h.cost_basis}</td>
                <td className="px-3 py-2">{h.price ? `$${h.price.toFixed(2)}` : '—'}</td>
                <td className="px-3 py-2">{h.value ? `$${h.value.toLocaleString()}` : '—'}</td>
                <td className={`px-3 py-2 ${(h.gain_pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {h.gain_pct != null ? `${h.gain_pct >= 0 ? '+' : ''}${h.gain_pct}%` : '—'}
                </td>
                <td className="px-3 py-2">{h.target_pct || '—'}</td>
                <td className="px-3 py-2">{h.actual_pct ?? '—'}</td>
                <td className="px-3 py-2">
                  <button onClick={() => remove(h.ticker)} className="text-red-400 hover:text-red-300">✕</button>
                </td>
              </tr>
            ))}
            {!portfolio?.holdings.length && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-hud-dim">No positions yet.</td></tr>
            )}
          </tbody>
        </table>
        {portfolio?.total_value != null && (
          <p className="px-3 py-2 text-sm hud-readout text-hud-cyan">
            Total ${portfolio.total_value.toLocaleString()}
            {portfolio.total_gain_pct != null && ` (${portfolio.total_gain_pct >= 0 ? '+' : ''}${portfolio.total_gain_pct}%)`}
          </p>
        )}
      </div>

      <div className="hud-panel p-3 space-y-2">
        <div className="flex items-center gap-2">
          <button onClick={getPrompt}
            className="px-3 py-1.5 text-xs border border-hud-cyan/50 text-hud-cyan rounded hover:bg-hud-cyan/10">
            Generate deep-analysis prompt
          </button>
          {prompt && (
            <button onClick={() => { navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
              className="px-3 py-1.5 text-xs border border-hud-border rounded text-hud-dim hover:text-hud-cyan">
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          )}
        </div>
        {prompt && <pre className="text-[11px] whitespace-pre-wrap bg-black/30 rounded p-3 max-h-64 overflow-y-auto">{prompt}</pre>}
        <p className="text-[10px] text-hud-dim">Paste it into Claude or ChatGPT for the heavy reasoning — Jarvis doesn't automate trade advice.</p>
      </div>
    </div>
  )
}
