import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BadgeCollection } from "@/components/BadgeCollection";
import type { BadgeSummary } from "@/lib/badges";
import Link from "next/link";
export default async function BadgesPage() {
  const db = await createClient(),
    {
      data: { user },
    } = await db.auth.getUser();
  if (!user) redirect("/auth/login");
  // This visit itself is a check-in; use saved timezone or initialize browser timezone via the tracker.
  const { data: settings } = await db
    .from("badge_settings")
    .select("timezone")
    .eq("user_id", user.id)
    .maybeSingle();
  if (settings)
    await db.rpc("record_athlete_activity", { p_timezone: settings.timezone });
  const { data, error } = await db.rpc("my_badge_summary");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Your badges</h1>
        <p className="mt-2 text-zinc-400">
          Show up. Put in the work. Build your story.
        </p>
        <Link
          href="/profile#badge-settings"
          className="mt-2 inline-block text-sm text-orange-400"
        >
          Set training days and timezone →
        </Link>
      </div>
      {error ? (
        <p role="alert" className="text-red-400">
          Badges could not load. Check that the latest migration is installed,
          then retry.
        </p>
      ) : (
        <BadgeCollection summary={data as BadgeSummary} />
      )}
    </div>
  );
}
