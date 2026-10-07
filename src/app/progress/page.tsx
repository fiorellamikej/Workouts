import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PerformanceHistory } from '@/components/PerformanceHistory';
export default async function Page() {
  const db = await createClient(), { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/auth/login');
  const [history, records] = await Promise.all([db.rpc('exercise_history', { p_limit: 1000 }), db.from('athlete_records').select('*').eq('user_id', user.id).order('achieved_at')]);
  return <div className="space-y-5"><h1 className="ss-title">Progress over time</h1><p className="text-zinc-200">Compare the same exercise at the same rep count. Warm-up and incomplete sets are excluded. Program and Daily WOD sources remain labeled separately; Hero totals are not combined here.</p>{history.error || records.error ? <p role="alert" className="text-red-300">Could not load progress. Apply the workout progress migration and retry.</p> : <PerformanceHistory history={history.data || []} records={records.data || []} />}</div>;
}
