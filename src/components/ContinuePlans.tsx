import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { PlanResult, PlanSession, TrainingPlan, UserPlanEnrollment } from '@/types/database'
import { trainingProgress, workoutSections } from '@/lib/workout-sections'
import { PlanProgress } from './PlanProgress'
export async function ContinuePlans({ userId, savedPlan, savedSession }: { userId: string; savedPlan?: string; savedSession?: string }) {
  const db = await createClient()
  const { data: enrollments, error } = await db.from('user_plan_enrollments').select('*').eq('user_id', userId).eq('is_following', true).order('created_at', { ascending: false }).returns<UserPlanEnrollment[]>()
  if (error) return <p role="alert" className="text-red-300">Could not load your program progress. Refresh to try again.</p>
  if (!enrollments?.length) return <section className="ss-panel"><h2 className="ss-label mb-3">Your Programs</h2><Link className="text-orange-300" href="/plans">Choose a training plan →</Link></section>
  const items = await Promise.all(enrollments.map(async e => {
    const [plan, sessions, results] = await Promise.all([
      db.from('training_plans').select('*').eq('id', e.plan_id).maybeSingle<TrainingPlan>(),
      db.from('plan_sessions').select('*').eq('plan_id', e.plan_id).order('order_index').order('week_number').order('day_number').order('id').returns<PlanSession[]>(),
      db.from('plan_results').select('*').eq('enrollment_id', e.id).eq('attempt', e.current_attempt).returns<PlanResult[]>(),
    ])
    if (plan.error || sessions.error || results.error) return { e, error: true as const }
    const ordered = sessions.data || [], done = new Set(results.data?.map(r => r.session_id) || [])
    const saved = e.plan_id === savedPlan ? ordered.find(s => s.id === savedSession && done.has(s.id)) : undefined
    const next = ordered.find(s => s.id === e.current_session_id) || ordered.find(s => !done.has(s.id))
    const following = saved ? ordered[ordered.findIndex(s => s.id === saved.id) + 1] : undefined
    return { e, error: false as const, plan: plan.data, ordered, done, next, saved, following, progress: trainingProgress(ordered, [...done]) }
  }))
  return <section className="space-y-6">{items.map((item, i) => {
    if (item.error) return <p className="ss-panel text-red-300" key={item.e.id}>Could not load this program.</p>
    const shown = item.saved || item.next
    const week = shown?.week_number || 1
    const href = shown ? `/plans/${item.e.plan_id}?day=${shown.id}` : `/plans/${item.e.plan_id}`
    return <article key={item.e.id} className="space-y-4">
      {item.saved && <p role="status" className="border border-orange-500 bg-orange-500/10 px-4 py-3 font-semibold text-orange-300">✓ Workout saved. Nice work!</p>}
      <section className="ss-panel space-y-4 border-t-4 border-t-orange-500">
        <div className="flex justify-between gap-3"><h2 className="ss-label text-orange-300">{i === 0 ? "Today's Workout" : 'Also Following'}</h2><span className="text-xs text-zinc-400">{item.e.status === 'paused' ? 'Paused' : item.saved ? 'Completed' : ''}</span></div>
        <p className="font-mono text-xs uppercase text-zinc-400">{item.plan?.title} / Week {week}{shown ? ` / Day ${shown.day_number}` : ''}</p>
        <h3 className="ss-title">{shown?.title || 'Program complete!'}</h3>
        {shown && <p className="text-sm text-zinc-400">{shown.session_type === 'rest' ? 'Scheduled rest day' : `${workoutSections(shown.description, shown.exercises || [], shown.prescriptions || []).length} sections`}{shown.estimated_minutes ? ` · About ${shown.estimated_minutes} min` : ''}</p>}
        <Link href={href} className={item.saved ? 'ss-secondary w-full' : 'ss-primary w-full'}>{item.saved ? 'Review Saved Workout' : shown ? 'View Workout' : 'View Results / Restart'} →</Link>
      </section>
      <section className="ss-panel"><div className="mb-4 flex justify-between gap-3"><h3 className="ss-label">This Week</h3><span className="text-xs text-zinc-400">Week {week} of {item.plan?.duration_weeks}</span></div><div className="grid grid-cols-7 gap-1 sm:gap-2">{Array.from({ length: 7 }, (_, n) => {
        const session = item.ordered.find(s => s.week_number === week && s.day_number === n + 1)
        const active = session?.id === shown?.id
        return <div className={`min-w-0 border text-center ${active ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-700'}`} key={n}>{session ? <Link aria-label={`Day ${n + 1}: ${session.title}${item.done.has(session.id) ? ', completed' : ''}`} href={`/plans/${item.e.plan_id}?day=${session.id}`} className="block min-h-16 py-3"><span className="block font-mono text-lg">{item.done.has(session.id) ? '✓' : n + 1}</span><span className="block text-[10px] uppercase text-zinc-400">{session.session_type === 'rest' ? 'Rest' : 'Train'}</span></Link> : <span className="block py-3"><span className="block font-mono text-lg">{n + 1}</span><span className="block text-[10px] text-zinc-500">—</span></span>}</div>
      })}</div><p className="mt-3 text-xs text-zinc-400">Plan day numbers. Rest appears only where scheduled; a dash means no session is listed.</p></section>
      <PlanProgress completed={item.progress.completed} total={item.progress.total} />
      {item.saved && item.following && <section className="ss-panel space-y-3"><h3 className="ss-label text-orange-300">Next Scheduled Day</h3><p className="text-xl font-bold">{item.following.title}</p><p className="text-sm text-zinc-400">Week {item.following.week_number} / Day {item.following.day_number}</p><Link href={`/plans/${item.e.plan_id}?day=${item.following.id}`} className="ss-primary w-full">Preview Next Workout →</Link></section>}
    </article>
  })}</section>
}
