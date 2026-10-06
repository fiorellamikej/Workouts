import { MailingPreference } from "@/components/MailingPreference";
import { BadgeProfileSettings } from "@/components/BadgeProfileSettings";
import { PersonalRecords } from "@/components/PersonalRecords";
import { ContinuePlans } from "@/components/ContinuePlans";
import type { AthleteRecord } from "@/lib/training";
import type { ResultWithWorkout } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTime } from "@/lib/utils";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, is_admin, created_at, updated_at")
    .eq("id", user.id)
    .single();

  const { data: mailingPreference, error: mailingError } = await supabase.rpc(
    "my_mailing_preference",
  );
  const { data: badgeSettings } = await supabase
    .from("badge_settings")
    .select("timezone, workout_days, schedule_configured")
    .eq("user_id", user.id)
    .maybeSingle();
  const { data: results } = await supabase
    .from("results")
    .select(
      `
      *,
      workouts (title, workout_date, workout_type)
    `,
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<ResultWithWorkout[]>();

  const { data: records, error: recordsError } = await supabase
    .from("athlete_records")
    .select("*")
    .eq("user_id", user.id)
    .order("achieved_at", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<AthleteRecord[]>();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">
          {profile?.display_name || user.email?.split("@")[0]}
        </h1>
        <p className="mt-1 text-zinc-400">{user.email}</p>
        {profile?.is_admin && (
          <span className="mt-2 inline-block rounded-full bg-orange-600/20 px-2.5 py-0.5 text-xs font-medium text-orange-400">
            Admin
          </span>
        )}
      </div>

      <Link
        href="/badges"
        className="inline-block rounded-lg bg-orange-600 px-4 py-2"
      >
        View your badges →
      </Link>
      <Link href="/profile/account" className="inline-block rounded-lg border border-zinc-700 px-4 py-2 text-orange-400">Account settings →</Link>
      <div id="badge-settings">
        <BadgeProfileSettings
          displayName={profile?.display_name || ""}
          settings={badgeSettings}
        />
      </div>
      <MailingPreference
        initial={mailingPreference === true}
        error={!!mailingError}
      />
      <ContinuePlans userId={user.id} />
      {recordsError ? (
        <p role="alert" className="text-red-400">
          Could not load records. Check that the database migration was applied.
        </p>
      ) : (
        <PersonalRecords records={records || []} />
      )}

      <section>
        <h2 className="text-xl font-semibold mb-4">Your Recent Results</h2>
        {!results?.length ? (
          <p className="text-zinc-400">No results logged yet.</p>
        ) : (
          <div className="space-y-3">
            {results.map((r) => (
              <Link
                key={r.id}
                href={`/workouts/${r.workout_id}`}
                className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 hover:border-zinc-700 transition"
              >
                <div>
                  <p className="font-medium text-orange-400">
                    {r.workouts?.title || "Workout"}
                  </p>
                  <p className="text-sm text-zinc-400">
                    {r.workouts?.workout_date
                      ? formatDate(r.workouts.workout_date)
                      : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-lg text-white">
                    {r.workouts?.workout_type === "amrap"
                      ? `${r.rounds || 0} + ${r.extra_reps || 0}`
                      : formatTime(r.completion_time_seconds)}
                  </p>
                  {!r.is_rx && (
                    <span className="text-xs text-zinc-400">Scaled</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
