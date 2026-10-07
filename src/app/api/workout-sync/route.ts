import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403, headers });
  try {
    const body = await request.text();
    if (Buffer.byteLength(body) > 1100000) return NextResponse.json({ error: 'Workout submission is too large.' }, { status: 413, headers });
    const payload = JSON.parse(body), db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user || user.id !== payload.userId) return NextResponse.json({ error: 'Sign in with the account that recorded this workout. It remains saved on this device.' }, { status: 401, headers });
    const { data, error } = await db.rpc('sync_workout_event', { p_operation: payload.operation, p_event: payload.event });
    if (error) return NextResponse.json({ error: error.message }, { status: 409, headers });
    return NextResponse.json(data, { headers });
  } catch { return NextResponse.json({ error: 'Could not sync. Your local workout is preserved. Reconnect and retry.' }, { status: 503, headers }); }
}
