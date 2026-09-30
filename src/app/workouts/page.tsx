import { createClient } from '@/lib/supabase/server'
import { formatDate, formatTime } from '@/lib/utils'
import Link from 'next/link'

export default async function WorkoutsPage() {
  const supabase = await createClient()

  const { data: workouts } = await supabase
    .from('workouts')
    .select('*')
    .order('workout_date', { ascending: false })
    .limit(30)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Workout History</h1>
        <p className="mt-1 text-zinc-400">Past daily WODs</p>
      </div>

      {!workouts?.length ? (
        <p className="text-zinc-400">No workouts posted yet.</p>
      ) : (
        <div className="space-y-3">
          {workouts.map((w) => (
            <Link
              key={w.id}
              href={`/workouts/${w.id}`}
              className="block rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 hover:border-zinc-700 transition"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-orange-400">{w.title}</h2>
                  <p className="text-sm text-zinc-400 mt-0.5">{formatDate(w.workout_date)}</p>
                </div>
                <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium uppercase text-zinc-300">
                  {w.workout_type.replace('_', ' ')}
                </span>
              </div>
              <p className="mt-3 text-sm text-zinc-300 line-clamp-2 whitespace-pre-wrap">
                {w.description}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
