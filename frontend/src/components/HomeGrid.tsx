// HomeGrid — the customizable modular grid around the orb. Every panel is a
// widget from the registry; in EDIT LAYOUT mode each one can be moved up/
// down, switched to the other side, resized (S/M/L), or removed, and hidden
// widgets can be added back per column. The arrangement persists in
// localStorage per device, so the laptop and the iPhone can each have their
// own layout. On phones the two columns stack into one scrollable feed.
import { useEffect, useMemo, useState } from 'react'
import { WIDGETS, type HudData } from './widgets'

export type WidgetSize = 'S' | 'M' | 'L'
export interface PlacedWidget { id: string; size: WidgetSize }
export interface Layout { left: PlacedWidget[]; right: PlacedWidget[] }

const LAYOUT_KEY = 'jarvis-layout-v1'

const DEFAULT_LAYOUT: Layout = {
  left: [
    { id: 'weather', size: 'M' },
    { id: 'today-agenda', size: 'M' },
    { id: 'due', size: 'M' },
    { id: 'tomorrow-agenda', size: 'M' },
    { id: 'inbox', size: 'M' },
  ],
  right: [
    { id: 'news', size: 'L' },
    { id: 'stocks', size: 'M' },
    { id: 'status', size: 'M' },
  ],
}

const SIZE_CLASSES: Record<WidgetSize, string> = {
  S: 'max-h-44 overflow-y-auto',
  M: 'max-h-[26rem] overflow-y-auto',
  L: 'overflow-visible',
}

function loadLayout(): Layout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return DEFAULT_LAYOUT
    const parsed = JSON.parse(raw) as Layout
    const valid = (arr: PlacedWidget[]) => arr.filter((w) => WIDGETS[w.id])
    return { left: valid(parsed.left ?? []), right: valid(parsed.right ?? []) }
  } catch {
    return DEFAULT_LAYOUT
  }
}

export default function HomeGrid({
  data,
  onOpenInbox,
  editing,
  side,
}: {
  data: HudData
  onOpenInbox: () => void
  editing: boolean
  side: 'left' | 'right'
}) {
  const [layout, setLayout] = useState<Layout>(loadLayout)

  useEffect(() => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
  }, [layout])

  // storage events keep both rendered columns (two HomeGrid instances) in sync
  useEffect(() => {
    const onStorage = () => setLayout(loadLayout())
    window.addEventListener('jarvis-layout', onStorage)
    return () => window.removeEventListener('jarvis-layout', onStorage)
  }, [])

  const update = (next: Layout) => {
    setLayout(next)
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(next))
    window.dispatchEvent(new Event('jarvis-layout'))
  }

  const column = layout[side]
  const otherSide = side === 'left' ? 'right' : 'left'

  const move = (index: number, delta: number) => {
    const next = [...column]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    update({ ...layout, [side]: next })
  }

  const swapSide = (index: number) => {
    const item = column[index]
    update({
      ...layout,
      [side]: column.filter((_, i) => i !== index),
      [otherSide]: [...layout[otherSide], item],
    })
  }

  const resize = (index: number) => {
    const order: WidgetSize[] = ['S', 'M', 'L']
    const next = [...column]
    next[index] = { ...next[index], size: order[(order.indexOf(next[index].size) + 1) % 3] }
    update({ ...layout, [side]: next })
  }

  const remove = (index: number) => {
    update({ ...layout, [side]: column.filter((_, i) => i !== index) })
  }

  const addWidget = (id: string) => {
    if (!id) return
    update({ ...layout, [side]: [...column, { id, size: 'M' }] })
  }

  const hidden = useMemo(() => {
    const placed = new Set([...layout.left, ...layout.right].map((w) => w.id))
    return Object.values(WIDGETS).filter((w) => !placed.has(w.id))
  }, [layout])

  return (
    <div className="space-y-3">
      {column.map((placed, i) => {
        const def = WIDGETS[placed.id]
        if (!def) return null
        return (
          <div key={placed.id}
               className={`hud-panel p-3.5 ${editing ? 'border-hud-cyan/50 border-dashed' : ''}`}>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="hud-readout text-[11px] uppercase tracking-widest text-hud-cyan/90 font-semibold">
                {def.title}
              </h3>
              {editing && (
                <div className="flex gap-1 hud-readout text-[11px]">
                  <button onClick={() => move(i, -1)} title="Move up"
                    className="px-1.5 py-0.5 border border-hud-border rounded text-hud-dim hover:text-hud-cyan">↑</button>
                  <button onClick={() => move(i, 1)} title="Move down"
                    className="px-1.5 py-0.5 border border-hud-border rounded text-hud-dim hover:text-hud-cyan">↓</button>
                  <button onClick={() => swapSide(i)} title="Move to other side"
                    className="px-1.5 py-0.5 border border-hud-border rounded text-hud-dim hover:text-hud-cyan">⇄</button>
                  <button onClick={() => resize(i)} title="Cycle size S/M/L"
                    className="px-1.5 py-0.5 border border-hud-cyan/40 rounded text-hud-cyan">{placed.size}</button>
                  <button onClick={() => remove(i)} title="Remove"
                    className="px-1.5 py-0.5 border border-red-500/40 rounded text-red-400 hover:bg-red-500/10">✕</button>
                </div>
              )}
            </div>
            <div className={SIZE_CLASSES[placed.size]}>
              {def.render({ data, onOpenInbox })}
            </div>
          </div>
        )
      })}

      {editing && (
        <div className="hud-panel p-3 border-dashed border-hud-cyan/40">
          <p className="hud-readout text-[11px] uppercase text-hud-cyan/80 mb-2">+ Add module</p>
          {hidden.length === 0 ? (
            <p className="text-sm text-hud-dim">Every module is already placed.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {hidden.map((w) => (
                <button key={w.id} onClick={() => addWidget(w.id)}
                  className="px-3 py-1.5 text-sm border border-hud-border rounded text-hud-text hover:border-hud-cyan/60 hover:text-hud-cyan">
                  {w.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
