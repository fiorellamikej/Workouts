import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  // Restrict recovery destinations to an explicit internal route.
  const recovery =
    request.nextUrl.searchParams.get("next") === "/auth/reset-password";
  const failure = recovery
    ? "/auth/forgot-password?error=recovery"
    : "/auth/login?error=confirmation";
  let destination = failure;
  if (code) {
    try {
      const client = await createClient();
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error)
        destination = recovery ? "/auth/reset-password" : "/dashboard";
    } catch {
      /* Safe failure, never include token/error in the redirect. */
    }
  }
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
