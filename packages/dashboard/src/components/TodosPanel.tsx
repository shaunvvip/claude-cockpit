import type { TodoItem } from '@claude-cockpit/shared'

export function TodosPanel({ todos }: { todos: readonly TodoItem[] }) {
  return (
    <div className="bg-cockpit-panel border border-cockpit-line rounded p-2">
      <div className="text-cockpit-muted text-[10px] mb-1">TODOS</div>
      {todos.length === 0 && <div className="text-cockpit-muted text-[10px]">—</div>}
      {todos.map((t, i) => (
        <div key={i} className="text-xs flex gap-2 items-center">
          <span>{t.completed ? '☑' : '☐'}</span>
          <span className={t.completed ? 'text-cockpit-muted line-through' : 'text-cockpit-text'}>{t.text}</span>
        </div>
      ))}
    </div>
  )
}
