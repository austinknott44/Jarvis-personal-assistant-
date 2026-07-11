// Workout Split tab — same table voice edits write to ("change leg day to
// Thursday" and this UI are equivalent).
import { useCallback, useEffect, useState } from 'react'
import { api, type SplitDay } from '../../api'

export default function WorkoutSplitTab() {
  const [split, setSplit] = useState<SplitDay[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [focus, setFocus] = useState('')
  const [exercises, setExercises] = useState('')

  const load = useCallback(() => { api.workout().then((r) => setSplit(r.split)).catch(() => {}) }, [])
  useEffect(load, [load])

  const startEdit = (d: SplitDay) => {
    setEditing(d.day)
    setFocus(d.focus)
    setExercises(d.exercises.map((e) => `${e.name}${e.sets ? ` ${e.sets}x${e.reps}` : ''}`).join(', '))
  }

  const save = async () => {
    if (!editing) return
    await api.setWorkoutDay(editing, focus, exercises)
    setEditing(null)
    load()
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <h2 className="hud-readout text-hud-cyan text-sm uppercase tracking-widest hud-glow">Workout Split</h2>
      <p className="text-xs text-hud-dim">Edit here or by voice — “add Romanian deadlifts to pull day” writes to the same plan.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {split.map((d) => (
          <div key={d.day} className={`hud-panel p-3 ${d.focus.toLowerCase() === 'rest' ? 'opacity-60' : ''}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="hud-readout text-xs uppercase text-hud-cyan/90">{d.day}</span>
              <button onClick={() => startEdit(d)} className="text-[10px] text-hud-dim hover:text-hud-cyan">edit</button>
            </div>
            <p className="text-sm mb-1">{d.focus}</p>
            <ul className="text-xs text-hud-dim space-y-0.5">
              {d.exercises.map((e, i) => (
                <li key={i}>{e.name}{e.sets && <span className="hud-readout"> {e.sets}×{e.reps}</span>}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {editing && (
        <div className="hud-panel p-4 space-y-2 max-w-lg">
          <h3 className="hud-readout text-xs uppercase text-hud-cyan">{editing}</h3>
          <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Focus (e.g. Push, Legs, Rest)"
            className="w-full bg-black/30 border border-hud-border rounded px-2 py-1.5 text-sm" />
          <input value={exercises} onChange={(e) => setExercises(e.target.value)}
            placeholder="Exercises: Bench 4x8, OHP 3x10, Dips 3x12"
            className="w-full bg-black/30 border border-hud-border rounded px-2 py-1.5 text-sm" />
          <div className="flex gap-2">
            <button onClick={save} className="px-3 py-1.5 text-xs border border-emerald-500/60 text-emerald-300 rounded hover:bg-emerald-500/10">Save</button>
            <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs border border-hud-border text-hud-dim rounded">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
