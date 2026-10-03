import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type {
  PlanSession,
  TrainingPlan,
  UserPlanEnrollment,
} from '@/types/database'
export async function ContinuePlans({ userId }: { userId: string }) {
  const db = await createClient()
  const { data: enrollments, error } = await db
    .from('user_plan_enrollments')
    .select('*')
    .eq('user_id', userId)
    .eq('is_following', true)
    .order('created_at', { ascending: false })
    .returns<UserPlanEnrollment[]>()
  if (error)
    return (
      <p role="alert" className="text-red-400">
        Could not load your program progress. Refresh to try again.
      </p>
    )
  if (!enrollments?.length)
    return (
      <section className="rounded-xl border border-zinc-800 p-5">
        <h2 className="text-xl font-semibold">Your Programs</h2>
        <Link className="text-orange-400" href="/plans">
          Choose a training plan →
        </Link>
      </section>
    )
  const items = await Promise.all(
    enrollments.map(async (e) => {
      const [plan, sessions, results] = await Promise.all([
        db
          .from('training_plans')
          .select('*')
          .eq('id', e.plan_id)
          .maybeSingle<TrainingPlan>(),
        db
          .from('plan_sessions')
          .select('*')
          .eq('plan_id', e.plan_id)
          .order('order_index')
          .order('week_number')
          .order('day_number')
          .order('id')
          .returns<PlanSession[]>(),
        db
          .from('plan_results')
          .select('session_id')
          .eq('enrollment_id', e.id)
          .eq('attempt', e.current_attempt),
      ])
      if (plan.error || sessions.error || results.error)
        return { e, error: true }
      const done = new Set(results.data?.map((r) => r.session_id) || [])
      const next =
        sessions.data?.find((s) => s.id === e.current_session_id) ||
        sessions.data?.find((s) => !done.has(s.id))
      return {
        e,
        error: false,
        plan: plan.data,
        next,
        count: done.size,
        total: sessions.data?.length || 0,
      }
    }),
  )
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Your Programs</h2>
      {items.map((item) => (
        <div
          key={item.e.id}
          className="rounded-xl border border-orange-800/50 bg-zinc-900/50 p-4"
        >
          {item.error ? (
            <p className="text-red-400">Could not load this program.</p>
          ) : (
            <>
              <h3 className="font-semibold">
                {item.plan?.title || 'Unavailable program'}
              </h3>
              <p className="text-sm text-zinc-400">
                Run {item.e.current_attempt} · {item.count}/{item.total}{' '}
                sessions completed
                {item.e.status === 'paused' ? ' · Paused' : ''}
              </p>
              {item.next ? (
                <>
                  <p className="mt-2">
                    Selected: Week {item.next.week_number}, day{' '}
                    {item.next.day_number} · {item.next.title}
                  </p>
                  <Link
                    href={`/plans/${item.e.plan_id}#session-${item.next.id}`}
                    className="mt-3 inline-block rounded-lg bg-orange-600 px-4 py-2"
                  >
                    {item.count === item.total
                      ? 'View Results / Restart'
                      : item.e.status === 'paused'
                        ? 'View Program'
                        : 'Continue Workout'}
                  </Link>
                </>
              ) : (
                <p className="mt-2 text-green-400">
                  {item.total ? (
                    <Link
                      className="text-orange-400"
                      href={`/plans/${item.e.plan_id}`}
                    >
                      Program complete! View results or restart →
                    </Link>
                  ) : (
                    'No sessions available yet.'
                  )}
                </p>
              )}
            </>
          )}
        </div>
      ))}
    </section>
  )
}
