import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
export async function GET() {
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  return NextResponse.json({ userId: user?.id || null }, { headers: { 'Cache-Control': 'private, no-store' } });
}
