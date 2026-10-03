import type { TrainingPlan } from '@/types/database'

export function ProgramOverview({
  plan,
  sessionCount,
  weeklySessions,
}: {
  plan: TrainingPlan
  sessionCount: number
  weeklySessions: string
}) {
  const equipment = (items: string[] | undefined) =>
    items?.length ? (
      <ul className="list-disc space-y-2 pl-5 text-zinc-300">
        {items.map((item, i) => (
          <li key={i} className="break-words">
            {item}
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-zinc-400">
        Not specified. Check the workout preview before starting.
      </p>
    )
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 text-sm text-zinc-300">
        <span className="rounded-full bg-zinc-800 px-3 py-1">
          {plan.duration_weeks} weeks
        </span>
        <span className="rounded-full bg-zinc-800 px-3 py-1">
          {sessionCount} scheduled sessions
        </span>
        <span className="rounded-full bg-zinc-800 px-3 py-1">
          {weeklySessions}
        </span>
      </div>
      <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="text-xl font-semibold">Program intention</h2>
        <p className="whitespace-pre-wrap text-zinc-300">
          {plan.goal || 'Not specified.'}
        </p>
      </section>
      <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="text-xl font-semibold">About this program</h2>
        <p className="whitespace-pre-wrap text-zinc-300">
          {plan.description || 'A description has not been added yet.'}
        </p>
      </section>
      <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="text-xl font-semibold">Suggested fitness level</h2>
        <p className="font-medium capitalize text-orange-400">
          {plan.difficulty || 'Not specified'}
        </p>
        {plan.fitness_guidance && (
          <p className="whitespace-pre-wrap text-zinc-300">
            {plan.fitness_guidance}
          </p>
        )}
      </section>
      <div className="grid gap-5 sm:grid-cols-2">
        <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="text-xl font-semibold">Required equipment</h2>
          {equipment(plan.equipment_required)}
        </section>
        <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="text-xl font-semibold">Suggested equipment</h2>
          {equipment(plan.equipment_suggested)}
        </section>
      </div>
    </div>
  )
}
