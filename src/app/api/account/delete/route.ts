import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
function reply(body: object, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin || !request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "Invalid request." }, 403);
  try {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user?.email) return reply({ error: "Sign in again before deleting your account." }, 401);
    const body = await request.json();
    if (body.confirmation !== "DELETE" || typeof body.currentPassword !== "string" || !body.currentPassword || body.currentPassword.length > 4096) return reply({ error: "Enter your current password and type DELETE." }, 400);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !serviceKey) return reply({ error: "Account deletion is unavailable. Please contact the administrator." }, 503);
    const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
    const verifier = createSupabaseClient(url, anonKey, authOptions);
    const verified = await verifier.auth.signInWithPassword({ email: user.email, password: body.currentPassword });
    if (verified.error || verified.data.user?.id !== user.id) return reply({ error: "Your current password could not be verified." }, 403);
    // Close the temporary reauthentication session without affecting the browser session.
    await verifier.auth.signOut({ scope: "local" });
    const admin = createSupabaseClient(url, serviceKey, authOptions);
    const removed = await admin.auth.admin.deleteUser(user.id);
    if (removed.error) return reply({ error: "Could not delete your account. No successful deletion was confirmed. Please contact the administrator." }, 500);
    return reply({ deleted: true }, 200);
  } catch { return reply({ error: "Could not process account deletion. Please try again." }, 500); }
}
