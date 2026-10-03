import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  let destination = "/auth/login?error=confirmation";
  if (token && (type === "email" || type === "signup")) {
    try {
      const client = await createClient();
      const { error } = await client.auth.verifyOtp({
        token_hash: token,
        type,
      });
      if (!error) destination = "/dashboard";
    } catch {
      /* Safe failure. */
    }
  }
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
