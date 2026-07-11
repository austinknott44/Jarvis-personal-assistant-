// Account / About Me — profile facts that seed Jarvis's memory.
import { useEffect, useState } from 'react'
import { api } from '../../api'

const FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: 'name', label: 'Name', placeholder: 'Austin' },
  { key: 'school', label: 'School', placeholder: 'Purdue University' },
  { key: 'major', label: 'Major', placeholder: 'e.g. Biology' },
  { key: 'year', label: 'Year', placeholder: 'e.g. Sophomore' },
  { key: 'goals', label: 'Goals', placeholder: 'What are you working toward?' },
  { key: 'preferences', label: 'Preferences', placeholder: 'How should Jarvis behave? Anything it should know?' },
]

export default function AccountTab() {
  const [profile, setProfile] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.profile().then((r) => setProfile(r.profile)).catch(() => {})
  }, [])

  const save = async () => {
    await api.saveProfile(profile)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 max-w-xl">
      <h2 className="hud-readout text-hud-cyan text-sm uppercase tracking-widest hud-glow">Account / About Me</h2>
      <p className="text-xs text-hud-dim">This profile seeds Jarvis's long-term memory (the `facts` table).</p>

      <div className="hud-panel p-4 space-y-3">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="text-xs text-hud-dim block mb-1">{f.label}</label>
            {f.key === 'goals' || f.key === 'preferences' ? (
              <textarea value={profile[f.key] ?? ''} placeholder={f.placeholder} rows={3}
                onChange={(e) => setProfile({ ...profile, [f.key]: e.target.value })}
                className="w-full bg-black/30 border border-hud-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-hud-cyan/60" />
            ) : (
              <input value={profile[f.key] ?? ''} placeholder={f.placeholder}
                onChange={(e) => setProfile({ ...profile, [f.key]: e.target.value })}
                className="w-full bg-black/30 border border-hud-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-hud-cyan/60" />
            )}
          </div>
        ))}
        <button onClick={save}
          className="px-4 py-2 text-xs border border-hud-cyan/50 text-hud-cyan rounded hover:bg-hud-cyan/10">
          {saved ? 'Saved ✓' : 'Save profile'}
        </button>
      </div>
    </div>
  )
}
