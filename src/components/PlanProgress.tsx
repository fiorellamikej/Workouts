export function PlanProgress({ completed, total, title = 'Plan progress', pending = false }: { completed: number; total: number; title?: string; pending?: boolean }) {
  const percent = total ? Math.min(100, Math.round(completed / total * 100)) : 0
  return <section className="ss-panel space-y-3" aria-label={title}>
    <div className="flex justify-between gap-4"><h3 className="ss-label">{title}</h3><span className="text-sm font-mono text-zinc-300">{completed} of {total} workouts</span></div>
    <div role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={completed} aria-valuetext={`${completed} of ${total} workouts${pending ? ' after saving' : ''}`} className="h-3 border border-zinc-600 bg-zinc-900"><div className="h-full bg-[#f36b21] transition-[width] motion-reduce:transition-none" style={{ width: `${percent}%` }} /></div>
    {pending && <p className="text-xs text-orange-300">Preview after saving. Your progress changes when you press Done.</p>}
  </section>
}
