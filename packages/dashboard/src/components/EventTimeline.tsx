import type { SessionEvent } from '../hooks/useSessionEvents.js'

function fmt(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

function describe_(e: SessionEvent): string {
  switch (e.type) {
    case 'TOOL_USE':  return `tool · ${e.name as string}`
    case 'USAGE':     return `usage · in ${e.inputTokens ?? '?'} out ${e.outputTokens ?? '?'}`
    case 'FILE_EDIT': return `file · ${e.tool as string} ${(e.path as string).split('/').slice(-1)[0] ?? ''}`
    case 'TODOS':     return `todos · ${(e.items as unknown[]).length} items`
  }
}

export function EventTimeline({ events }: { events: readonly SessionEvent[] }) {
  const sorted = [...events].sort((a, b) => b.ts - a.ts).slice(0, 40)
  return (
    <div className="bg-cockpit-panel border border-cockpit-line rounded p-2 col-span-full">
      <div className="text-cockpit-muted text-[10px] mb-1">RECENT ACTIVITY</div>
      {sorted.length === 0 && <div className="text-cockpit-muted text-[10px]">—</div>}
      {sorted.map((e, i) => (
        <div key={`${e.ts}-${i}`} className="flex gap-3 text-xs">
          <div className="text-cockpit-muted w-16">{fmt(e.ts)}</div>
          <div className="text-cockpit-text">{describe_(e)}</div>
        </div>
      ))}
    </div>
  )
}
