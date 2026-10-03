'use client'
import { useRouter } from 'next/navigation'
export function WorkoutHistoryPicker({
  planId,
  attempt,
  sessions,
  selectedId,
}: {
  planId: string
  attempt: number
  sessions: {
    id: string
    title: string
    week_number: number
    day_number: number
  }[]
  selectedId: string
}) {
  const router = useRouter()
  return (
    <label className="block text-sm">
      Select a workout to review
      <select
        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3"
        value={selectedId}
        onChange={(e) =>
          router.push(`/plans/${planId}?run=${attempt}&day=${e.target.value}`)
        }
      >
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            Week {s.week_number}, day {s.day_number} — {s.title}
          </option>
        ))}
      </select>
    </label>
  )
}
