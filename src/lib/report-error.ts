"use client";
import { createClient } from "@/lib/supabase/client";
import { safeErrorCode, safePagePath } from "@/lib/support";
const recent = new Map<string, number>();
export async function reportAppError(
  error: unknown,
  source: "window" | "promise" | "boundary" | "operation" = "operation",
) {
  if (typeof window === "undefined") return;
  const code = safeErrorCode(error);
  const digestValue =
    error && typeof error === "object" && "digest" in error
      ? error.digest
      : null;
  const digest =
    typeof digestValue === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(digestValue)
      ? digestValue
      : null;
  const path = safePagePath(window.location.pathname);
  const key = [source, path, code, digest].join(":");
  if (Date.now() - (recent.get(key) || 0) < 60000) return;
  if (recent.size >= 100) recent.clear();
  recent.set(key, Date.now());
  try {
    const client = createClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (user)
      await client.rpc("record_app_error", {
        p_source: source,
        p_page_path: path,
        p_error_code: code,
        p_digest: digest,
      });
  } catch {
    /* Reporting must never interrupt workouts or recurse. */
  }
}
