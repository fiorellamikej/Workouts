import type { PlanSession } from '@/types/database'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminPlanManager } from '@/components/AdminPlanManager'
import Link from 'next/link'

export default async function AdminPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/')

  const params = await searchParams
  const editId = params.edit || null

  let plan = null
  let sessions: PlanSession[] = []

  if (editId) {
    const { data } = await supabase
      .from('training_plans')
      .select('*')
      .eq('id', editId)
      .single()
    plan = data

    if (plan) {
      const { data: sess } = await supabase
        .from('plan_sessions')
        .select('*')
        .eq('plan_id', editId)
        .order('order_index', { ascending: true })
      sessions = sess || []
    }
  }

  // List all plans
  const { data: allPlans } = await supabase
    .from('training_plans')
    .select('id, title, duration_weeks, is_published, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-zinc-400 hover:text-white">
          ← Admin
        </Link>
        <h1 className="mt-2 text-3xl font-bold">
          {plan ? `Edit: ${plan.title}` : 'Create Training Plan'}
        </h1>
      </div>

      <AdminPlanManager existingPlan={plan} existingSessions={sessions} />

      {allPlans && allPlans.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">All Plans</h2>
          <div className="space-y-2">
            {allPlans.map((p) => (
              <Link
                key={p.id}
                href={`/admin/plans?edit=${p.id}`}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 transition ${
                  editId === p.id
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                }`}
              >
                <span className="font-medium">{p.title}</span>
                <span className="text-xs text-zinc-500">
                  {p.duration_weeks}w · {p.is_published ? 'Published' : 'Draft'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
