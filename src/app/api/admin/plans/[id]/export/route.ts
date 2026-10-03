import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizePlanImport } from "@/lib/plan-import";
export const dynamic = "force-dynamic";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const failure = (message: string, status: number) =>
    NextResponse.json({ error: message }, { status, headers });
  try {
    const client = await createClient();
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (authError || !user) return failure("Sign in to export a plan.", 401);
    const { data: admin, error: adminError } =
      await client.rpc("support_is_admin");
    if (adminError || !admin) return failure("Admin access required.", 403);
    const { id } = await params;
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      return failure("Invalid plan ID.", 400);
    const { data: plan, error: planError } = await client
      .from("training_plans")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (planError)
      return failure("Could not load the plan. Please retry.", 503);
    if (!plan) return failure("Plan not found.", 404);
    const { data: sessions, error: sessionError } = await client
      .from("plan_sessions")
      .select("*")
      .eq("plan_id", id)
      .order("order_index")
      .order("id");
    if (sessionError)
      return failure("Could not load all sessions. No file was exported.", 503);
    if (!sessions?.length)
      return failure(
        "Add and save at least one session before exporting this plan.",
        422,
      );
    let output;
    try {
      output = normalizePlanImport({
        format: "sword-shield-plan",
        version: 1,
        plan,
        sessions,
      });
    } catch (error) {
      return failure(
        error instanceof Error
          ? `Plan needs review before export: ${error.message}`
          : "Plan needs review before export.",
        422,
      );
    }
    const json = JSON.stringify(output, null, 2) + "\n";
    if (Buffer.byteLength(json, "utf8") > 5 * 1024 * 1024)
      return failure(
        "This plan exceeds the 5 MB import limit. Export a smaller program.",
        413,
      );
    const slug =
      String(plan.title)
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80)
        .toLowerCase() || "training-plan";
    return new NextResponse(json, {
      headers: {
        ...headers,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}.json"`,
      },
    });
  } catch {
    return failure("Could not export the plan. Please retry.", 503);
  }
}
