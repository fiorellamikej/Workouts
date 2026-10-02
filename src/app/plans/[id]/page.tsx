import { PersonalizedTargets } from '@/components/PersonalizedTargets'
import { timeText, type AthleteRecord, type ExerciseLog } from '@/lib/training'
import type {
  UserPlanEnrollment,
  PlanResult,
  PlanSession,
} from '@/types/database'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { EnrollButton } from '@/components/EnrollButton'
import { LogPlanResultForm } from '@/components/LogPlanResultForm'
import { formatTime } from '@/lib/utils'

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: plan } = await supabase
    .from('training_plans')
    .select('*')
    .eq('id', id)
    .single()

  if (!plan) notFound()

  const { data: sessions, error: sessionsError } = await supabase
    .from('plan_sessions')
    .select('*')
    .eq('plan_id', id)
    .order('order_index', { ascending: true })
    .order('week_number')
    .order('day_number')
    .order('id')
    .returns<PlanSession[]>()
  if (sessionsError)
    throw new Error('Could not load program sessions. Please retry.')

  // Enrollment + completed sessions for this user
  let enrollment: UserPlanEnrollment | null = null
  let completedSessionIds = new Set<string>()
  let planResults: PlanResult[] = []
  let records: AthleteRecord[] = []
  let exerciseLogs: ExerciseLog[] = []

  if (user) {
    const recordQuery = await supabase
      .from('athlete_records')
      .select('*')
      .eq('user_id', user.id)
      .returns<AthleteRecord[]>()
    if (recordQuery.error)
      throw new Error('Could not load records. Check the database migration.')
    records = recordQuery.data || []
    const { data: enr, error: enrollmentError } = await supabase
      .from('user_plan_enrollments')
      .select('*')
      .eq('user_id', user.id)
      .eq('plan_id', id)
      .maybeSingle()
    if (enrollmentError) throw new Error('Could not load enrollment.')
    enrollment = enr

    if (enrollment) {
      const { data: results, error: resultError } = await supabase
        .from('plan_results')
        .select('*')
        .eq('enrollment_id', enrollment.id)
      if (resultError) throw new Error('Could not load completed sessions.')
      const logQuery = await supabase
        .from('training_exercise_logs')
        .select('*')
        .eq('enrollment_id', enrollment.id)
        .order('created_at', { ascending: false })
        .returns<ExerciseLog[]>()
      if (logQuery.error) throw new Error('Could not load exercise history.')
      exerciseLogs = logQuery.data || []
      planResults = results || []
      completedSessionIds = new Set(planResults.map((r) => r.session_id))
    }
  }

  const nextSession = sessions?.find((s) => !completedSessionIds.has(s.id))

  // Group sessions by week
  const weeks: Record<number, typeof sessions> = {}
  sessions?.forEach((s) => {
    if (!weeks[s.week_number]) weeks[s.week_number] = []
    weeks[s.week_number]!.push(s)
  })

  const totalSessions = sessions?.length || 0
  const completedCount = completedSessionIds.size
  const progressPct =
    totalSessions > 0 ? Math.round((completedCount / totalSessions) * 100) : 0

  return (
    <div className="space-y-8">
      <div>
        <Link href="/plans" className="text-sm text-zinc-400 hover:text-white">
          ← All Plans
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-orange-400">
          {plan.title}
        </h1>
        {plan.goal && <p className="mt-1 text-lg text-zinc-300">{plan.goal}</p>}
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-zinc-800 px-3 py-1">
            {plan.duration_weeks} weeks
          </span>
          <span className="rounded-full bg-zinc-800 px-3 py-1 capitalize">
            {plan.difficulty}
          </span>
          {plan.tags?.map((t: string) => (
            <span key={t} className="rounded-full bg-zinc-800 px-3 py-1">
              {t}
            </span>
          ))}
        </div>
      </div>

      {plan.description && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <p className="text-zinc-300 whitespace-pre-wrap leading-relaxed">
            {plan.description}
          </p>
        </div>
      )}

      {/* Enrollment / Progress */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        {user ? (
          enrollment ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-green-400">
                    {enrollment.status === 'paused'
                      ? 'This plan is paused'
                      : nextSession
                        ? 'You are following this plan'
                        : 'Program complete!'}
                  </p>
                  <p className="text-sm text-zinc-400">
                    Started {enrollment.started_at} · {completedCount}/
                    {totalSessions} sessions
                  </p>
                </div>
                <span className="text-2xl font-bold text-orange-400">
                  {progressPct}%
                </span>
              </div>
              {nextSession && (
                <Link
                  href={`#session-${nextSession.id}`}
                  className="inline-block rounded-lg bg-orange-600 px-4 py-2"
                >
                  Continue: {nextSession.title}
                </Link>
              )}
              <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-orange-500 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <p className="text-zinc-300">Ready to start this program?</p>
              <EnrollButton planId={plan.id} />
            </div>
          )
        ) : (
          <p className="text-center text-zinc-400">
            <Link
              href="/auth/login"
              className="text-orange-400 hover:underline"
            >
              Log in
            </Link>{' '}
            to follow this plan and track your progress.
          </p>
        )}
      </div>

      {/* Sessions by week */}
      <div className="space-y-8">
        <h2 className="text-xl font-semibold">Program Schedule</h2>

        {Object.keys(weeks)
          .map(Number)
          .sort((a, b) => a - b)
          .map((weekNum) => (
            <div key={weekNum}>
              <h3 className="text-lg font-medium text-zinc-300 mb-3">
                Week {weekNum}
              </h3>
              <div className="space-y-3">
                {weeks[weekNum]!.map((session) => {
                  const isDone = completedSessionIds.has(session.id)
                  const result = planResults.find(
                    (r) => r.session_id === session.id,
                  )

                  return (
                    <div
                      id={`session-${session.id}`}
                      key={session.id}
                      className={`scroll-mt-24 rounded-xl border p-5 ${
                        isDone
                          ? 'border-green-800/50 bg-green-950/20'
                          : nextSession?.id === session.id && enrollment
                            ? 'border-orange-500 bg-zinc-900/50'
                            : 'border-zinc-800 bg-zinc-900/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-zinc-500">
                              Day {session.day_number}
                            </span>
                            {session.session_type === 'rest' && (
                              <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300">
                                Rest
                              </span>
                            )}
                            {isDone && (
                              <span className="rounded bg-green-700/40 px-1.5 py-0.5 text-xs text-green-300">
                                Completed
                              </span>
                            )}
                          </div>
                          <h4 className="mt-1 font-semibold text-white">
                            {session.title}
                          </h4>
                        </div>
                        {session.estimated_minutes && (
                          <span className="text-sm text-zinc-400 shrink-0">
                            ~{session.estimated_minutes} min
                          </span>
                        )}
                      </div>

                      {session.description && (
                        <div className="mt-3 whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed">
                          {session.description}
                        </div>
                      )}

                      {user && !isDone && (
                        <PersonalizedTargets
                          rules={session.prescriptions || []}
                          records={records}
                          logs={exerciseLogs}
                        />
                      )}
                      {isDone && result && (
                        <div className="mt-3 space-y-1 text-sm text-zinc-300">
                          {exerciseLogs
                            .filter((l) => l.result_id === result.id)
                            .map((l) => (
                              <p key={l.id}>
                                {l.label} · {l.sets} × {l.reps} ·{' '}
                                {l.unit === 'seconds'
                                  ? timeText(Number(l.value))
                                  : `${l.value} ${l.unit}`}{' '}
                                · {l.outcome}
                              </p>
                            ))}
                        </div>
                      )}

                      {session.notes && (
                        <p className="mt-2 text-xs text-zinc-500">
                          {session.notes}
                        </p>
                      )}

                      {/* Log result if enrolled and not rest day */}
                      {enrollment && enrollment.status !== 'paused' && (
                        <div className="mt-4 border-t border-zinc-800 pt-4">
                          {isDone && result ? (
                            <div className="text-sm text-zinc-400">
                              Logged:{' '}
                              <span className="font-mono text-orange-400">
                                {result.completion_time_seconds != null
                                  ? formatTime(result.completion_time_seconds)
                                  : result.rounds != null
                                    ? `${result.rounds} + ${result.extra_reps || 0}`
                                    : 'Done'}
                              </span>
                              {result.weight_used && (
                                <span className="ml-2">
                                  · {result.weight_used}
                                </span>
                              )}
                            </div>
                          ) : (
                            <LogPlanResultForm
                              enrollmentId={enrollment.id}
                              sessionId={session.id}
                              rules={session.prescriptions || []}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}
