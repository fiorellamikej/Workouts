import type { ActivePlanEnrollment, ResultWithProfile } from '@/types/database'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatTime } from '@/lib/utils'
import Link from 'next/link'
import { LogResultForm } from '@/components/LogResultForm'

export default async function HomePage() {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data: { user } } = await supabase.auth.getUser()

  // Active plans for this user
  let activePlans: ActivePlanEnrollment[] = []
  if (user) {
    const { data } = await supabase
      .from('user_plan_enrollments')
      .select(`
        id,
        status,
        started_at,
        training_plans (id, title, duration_weeks)
      `)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .returns<ActivePlanEnrollment[]>()
    activePlans = data || []
  }

  const { data: workout } = await supabase
    .from('workouts')
    .select('*')
    .eq('workout_date', today)
    .single()

  let userResult = null
  if (user && workout) {
    const { data } = await supabase
      .from('results')
      .select('*')
      .eq('workout_id', workout.id)
      .eq('user_id', user.id)
      .single()
    userResult = data
  }

  // Top 5 results for today (only if logged in)
  let topResults: ResultWithProfile[] = []
  if (user && workout) {
    const { data } = await supabase
      .from('results')
      .select(`
        *,
        profiles (display_name)
      `)
      .eq('workout_id', workout.id)
      .order('completion_time_seconds', { ascending: true, nullsFirst: false })
      .limit(5)
      .returns<ResultWithProfile[]>()
    topResults = data || []
  }

  return (
    <div className="space-y-8">
      {/* Active Plans banner */}
      {user && activePlans.length > 0 && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
          <p className="text-sm font-medium text-orange-400 mb-2">Your Active Plans</p>
          <div className="flex flex-wrap gap-2">
            {activePlans.map((e) => (
              <Link
                key={e.id}
                href={`/plans/${e.training_plans?.id}`}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 transition"
              >
                {e.training_plans?.title || 'Plan'}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Today&apos;s WOD</h1>
        <p className="mt-1 text-zinc-400">{formatDate(today)}</p>
      </div>

      {!workout ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-400">No workout posted for today yet.</p>
          <p className="mt-2 text-sm text-zinc-500">
            {user ? (
              <>
                Browse{' '}
                <Link href="/plans" className="text-orange-400 hover:underline">
                  training plans
                </Link>{' '}
                or check the{' '}
                <Link href="/workouts" className="text-orange-400 hover:underline">
                  history
                </Link>
                .
              </>
            ) : (
              <>
                <Link href="/plans" className="text-orange-400 hover:underline">
                  Browse training plans
                </Link>{' '}
                or check back later.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* WOD Card */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-orange-400">{workout.title}</h2>
                <span className="mt-1 inline-block rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-zinc-300">
                  {workout.workout_type.replace('_', ' ')}
                </span>
              </div>
              {workout.time_cap_seconds && (
                <div className="text-right text-sm text-zinc-400">
                  Time Cap
                  <div className="font-mono text-lg text-zinc-200">
                    {formatTime(workout.time_cap_seconds)}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 whitespace-pre-wrap text-zinc-200 leading-relaxed">
              {workout.description}
            </div>

            {workout.notes && (
              <p className="mt-4 text-sm text-zinc-400 border-t border-zinc-800 pt-4">
                <span className="font-medium text-zinc-300">Notes:</span> {workout.notes}
              </p>
            )}
          </div>

          {/* Log Result */}
          {user ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <h3 className="text-lg font-semibold mb-4">
                {userResult ? 'Your Result' : 'Log Your Result'}
              </h3>
              <LogResultForm
                workoutId={workout.id}
                workoutType={workout.workout_type}
                existing={userResult}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
              <p className="text-zinc-400">
                <Link href="/auth/login" className="text-orange-400 hover:underline">
                  Log in
                </Link>{' '}
                or{' '}
                <Link href="/auth/signup" className="text-orange-400 hover:underline">
                  sign up
                </Link>{' '}
                to log your result and see the leaderboard.
              </p>
            </div>
          )}

          {/* Mini Leaderboard */}
          {user && topResults.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Top Results</h3>
                <Link href="/leaderboard" className="text-sm text-orange-400 hover:underline">
                  Full leaderboard →
                </Link>
              </div>
              <div className="space-y-2">
                {topResults.map((r, i) => (
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
          )}
        </div>
      )}
    </div>
  )
}
