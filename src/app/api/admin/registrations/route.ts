import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { registrationCsv, type Registration } from "@/lib/support";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Sign in required." },
      { status: 401, headers },
    );
  const { data: admin, error: adminError } =
    await client.rpc("support_is_admin");
  if (adminError || !admin)
    return NextResponse.json(
      { error: "Admin access required." },
      { status: 403, headers },
    );
  const segment = request.nextUrl.searchParams.get("segment") || "subscribers";
  if (!["all", "subscribers"].includes(segment))
    return NextResponse.json(
      { error: "Invalid export segment." },
      { status: 400, headers },
    );
  const rows: Registration[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = client
      .from("registration_log")
      .select(
        "user_id,email,registered_at,email_confirmed_at,mailing_opt_in,consent_updated_at",
      )
      .order("registered_at")
      .order("user_id")
      .range(offset, offset + 999);
    if (segment === "subscribers")
      query = query
        .eq("mailing_opt_in", true)
        .not("email_confirmed_at", "is", null)
        .not("email", "is", null);
    const { data, error } = await query.returns<Registration[]>();
    if (error)
      return NextResponse.json(
        { error: "Could not export. Please retry." },
        { status: 503, headers },
      );
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return new NextResponse(registrationCsv(rows), {
    headers: {
      ...headers,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sword-shield-${segment}.csv"`,
    },
  });
}
