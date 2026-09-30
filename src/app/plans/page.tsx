import type { UserPlanEnrollment } from '@/types/database'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function PlansPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: plans } = await supabase
    .from('training_plans')
    .select('*')
    .eq('is_published', true)
    .order('created_at', { ascending: false })

  // Get user's active enrollments
  let enrollments: Pick<UserPlanEnrollment, 'plan_id' | 'status'>[] = []
  if (user) {
    const { data } = await supabase
      .from('user_plan_enrollments')
      .select('plan_id, status')
      .eq('user_id', user.id)
    enrollments = data || []
  }

  const enrolledPlanIds = new Set(enrollments.map((e) => e.plan_id))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Training Plans</h1>
        <p className="mt-1 text-zinc-400">
          Structured multi-week programs. Pick one and follow along day by day.
        </p>
      </div>

      {!plans?.length ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-400">No training plans published yet.</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {plans.map((plan) => {
            const isEnrolled = enrolledPlanIds.has(plan.id)
            return (
              <Link
                key={plan.id}
                href={`/plans/${plan.id}`}
                className="group rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 hover:border-orange-500/50 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-semibold text-orange-400 group-hover:text-orange-300">
                    {plan.title}
                  </h2>
                  {isEnrolled && (
                    <span className="shrink-0 rounded-full bg-green-600/20 px-2.5 py-0.5 text-xs font-medium text-green-400">
                      Following
                    </span>
                  )}
                </div>

                {plan.goal && (
                  <p className="mt-1 text-sm text-zinc-300">{plan.goal}</p>
                )}

                <p className="mt-3 text-sm text-zinc-400 line-clamp-2">
                  {plan.description}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span className="rounded-full bg-zinc-800 px-2.5 py-1">
                    {plan.duration_weeks} week{plan.duration_weeks !== 1 ? 's' : ''}
                  </span>
                  <span className="rounded-full bg-zinc-800 px-2.5 py-1 capitalize">
                    {plan.difficulty}
                  </span>
                  {plan.tags?.map((tag: string) => (
                    <span key={tag} className="rounded-full bg-zinc-800 px-2.5 py-1">
                      {tag}
                    </span>
                  ))}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
