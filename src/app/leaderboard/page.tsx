import { createClient } from '@/lib/supabase/server'
import { formatDate, formatTime } from '@/lib/utils'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  // Get recent workouts with result counts
  const { data: workouts } = await supabase
    .from('workouts')
    .select(`
      id,
      title,
      workout_date,
      workout_type
    `)
    .order('workout_date', { ascending: false })
    .limit(10)

  // For each recent workout, get top 5
  const boards = []
  if (workouts) {
    for (const w of workouts) {
      const { data: results } = await supabase
        .from('results')
        .select(`
          *,
          profiles (display_name)
        `)
        .eq('workout_id', w.id)
        .order('completion_time_seconds', { ascending: true, nullsFirst: false })
        .limit(5)

      if (results && results.length > 0) {
        boards.push({ workout: w, results })
      }
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Leaderboards</h1>
        <p className="mt-1 text-zinc-400">Top results from recent WODs</p>
      </div>

      {boards.length === 0 ? (
        <p className="text-zinc-400">No results logged yet.</p>
      ) : (
        <div className="space-y-8">
          {boards.map(({ workout, results }) => (
            <div key={workout.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <Link
                    href={`/workouts/${workout.id}`}
                    className="text-lg font-semibold text-orange-400 hover:underline"
                  >
                    {workout.title}
                  </Link>
                  <p className="text-sm text-zinc-400">{formatDate(workout.workout_date)}</p>
                </div>
                <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium uppercase text-zinc-300">
                  {workout.workout_type.replace('_', ' ')}
                </span>
              </div>
              <div className="space-y-2">
                {results.map((r: any, i: number) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-4 py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center font-mono text-sm text-zinc-500">
                        {i + 1}
                      </span>
                      <span className="font-medium">
                        {r.profiles?.display_name || 'Athlete'}
                      </span>
                      {!r.is_rx && (
                        <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300">
                          Scaled
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-orange-400">
                      {workout.workout_type === 'amrap'
                        ? `${r.rounds || 0} + ${r.extra_reps || 0}`
                        : formatTime(r.completion_time_seconds)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
