import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProgramOverview } from '@/components/ProgramOverview'
import { ProgramSchedulePreview } from '@/components/ProgramSchedulePreview'
import { EnrollButton } from '@/components/EnrollButton'
import type {
  TrainingPlan,
  PlanSession,
  UserPlanEnrollment,
} from '@/types/database'

export default async function ProgramOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  const { data: plan, error } = await db
    .from('training_plans')
    .select('*')
    .eq('id', id)
    .maybeSingle<TrainingPlan>()
  if (error) throw new Error('Could not load program overview. Please retry.')
  if (!plan) notFound()
  const { data: sessions, error: sessionsError } = await db
    .from('plan_sessions')
    .select('*')
    .eq('plan_id', id)
    .order('order_index')
    .order('week_number')
    .order('day_number')
    .order('id')
    .returns<PlanSession[]>()
  if (sessionsError)
    throw new Error('Could not load program preview. Please retry.')
  let enrollment: Pick<UserPlanEnrollment, 'status' | 'is_following'> | null =
    null
  if (user) {
    const query = await db
      .from('user_plan_enrollments')
      .select('status,is_following')
      .eq('user_id', user.id)
      .eq('plan_id', id)
      .maybeSingle()
    if (query.error)
      throw new Error('Could not load your program status. Please retry.')
    enrollment = query.data
  }
  const ordered = sessions || []
  const counts = Array.from(
    { length: plan.duration_weeks },
    (_, i) =>
      ordered.filter(
        (s) => s.week_number === i + 1 && s.session_type !== 'rest',
      ).length,
  )
  const min = Math.min(...counts),
    max = Math.max(...counts)
  const weeklySessions =
    !counts.length || max === 0
      ? 'See the schedule below'
      : `${min === max ? max : `${min}–${max}`} training/recovery sessions per week`
  return (
    <div className="space-y-8">
      <header>
        <Link href="/plans" className="text-sm text-zinc-400">
          ← All Plans
        </Link>
        <p className="mt-5 text-sm font-medium uppercase tracking-wide text-orange-400">
          Program overview
        </p>
        <h1 className="mt-2 text-3xl font-bold">{plan.title}</h1>
        <p className="mt-3 text-zinc-400">
          Review the program, equipment, and experience guidance before you
          start.
        </p>
        {!plan.is_published && (
          <p className="mt-2 text-sm text-yellow-400">
            Draft — visible to admins.
          </p>
        )}
      </header>
      <ProgramOverview
        plan={plan}
        sessionCount={ordered.length}
        weeklySessions={weeklySessions}
      />
      <section className="space-y-3 rounded-xl border border-orange-700/50 bg-orange-950/20 p-5">
        {enrollment?.is_following ? (
          <>
            <h2 className="text-xl font-semibold">Your program is saved</h2>
            <p className="text-zinc-300">
              Return to your saved progress and workout history.
            </p>
            <Link
              href={`/plans/${id}`}
              className="inline-block rounded-lg bg-orange-600 px-5 py-3 font-medium"
            >
              {enrollment.status === 'completed'
                ? 'View Results / Restart'
                : 'Continue Program'}
            </Link>
          </>
        ) : !ordered.length ? (
          <p>
            This program has no sessions yet. Check back after the schedule is
            added.
          </p>
        ) : user ? (
          <>
            <h2 className="text-xl font-semibold">Ready to begin?</h2>
            <p className="text-zinc-300">
              Start this program to save your place and log your workouts.
            </p>
            <EnrollButton
              planId={id}
              label={enrollment ? 'Rejoin Program' : 'Start Program'}
            />
            {enrollment && (
              <Link
                href={`/plans/${id}`}
                className="inline-block text-sm text-orange-400"
              >
                View saved history →
              </Link>
            )}
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold">Sign in to start</h2>
            <p className="text-zinc-300">
              You can browse the program now. Sign in to save your progress.
            </p>
            <Link
              href="/auth/login"
              className="inline-block rounded-lg bg-orange-600 px-5 py-3 font-medium"
            >
              Sign in
            </Link>
          </>
        )}
      </section>
      <ProgramSchedulePreview sessions={ordered} />
    </div>
  )
}
