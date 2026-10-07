import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
export async function GET(request: NextRequest) {
  const db = await createClient(), { data: { user } } = await db.auth.getUser();
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401, headers });
  const id = request.nextUrl.searchParams.get('id');
  const { data: enrollment, error: enrollmentError } = await db.from('user_plan_enrollments').select('*').eq('user_id', user.id).eq('plan_id', id).maybeSingle();
  if (enrollmentError || !enrollment || !enrollment.is_following || enrollment.status === 'paused') return NextResponse.json({ error: 'Join or resume this program before downloading.' }, { status: 409, headers });
  const queries = await Promise.all([
    db.from('training_plans').select('*').eq('id', id).single(),
    db.from('plan_sessions').select('*').eq('plan_id', id).order('order_index').order('week_number').order('day_number').order('id'),
    db.from('athlete_records').select('*').eq('user_id', user.id),
    db.from('training_exercise_logs').select('*,plan_results!inner(attempt)').eq('enrollment_id', enrollment.id).eq('plan_results.attempt', enrollment.current_attempt),
    db.from('plan_results').select('*').eq('enrollment_id', enrollment.id).eq('attempt', enrollment.current_attempt),
    db.rpc('exercise_history', { p_limit: 100 }),
  ]);
  if (queries.some(q => q.error)) return NextResponse.json({ error: 'Could not download the complete program. Retry.' }, { status: 503, headers });
  const [plan, sessions, records, logs, results, history] = queries.map(q => q.data);
  const output = { id: `${user.id}:${id}:${enrollment.current_attempt}`, userId: user.id, updatedAt: new Date().toISOString(), plan, sessions, records, logs, results, history, enrollment };
  if (Buffer.byteLength(JSON.stringify(output)) > 5 * 1024 * 1024) return NextResponse.json({ error: 'This program exceeds the 5 MB download limit.' }, { status: 413, headers });
  return NextResponse.json(output, { headers });
}
