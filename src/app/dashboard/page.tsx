import { wodToday, type WodPhase } from "@/lib/daily-wod";
import { WodPhaseGuide } from "@/components/WodPhaseGuide";
import { GettingStarted } from "@/components/GettingStarted";
import { ContinuePlans } from "@/components/ContinuePlans";
import type { ResultWithProfile } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTime } from "@/lib/utils";
import Link from "next/link";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ savedPlan?: string; savedSession?: string; savedWod?: string }> }) {
  const saved = await searchParams;
  const supabase = await createClient();
  const today = wodToday();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: onboarding } = user
    ? await supabase.from("user_onboarding").select("dismissed_at").eq("user_id", user.id).maybeSingle()
    : { data: null };

  const { data: workout } = await supabase
    .from("workouts")
    .select("*")
    .eq("workout_date", today)
    .single();

  const { data: phase, error: phaseError } = await supabase.from("daily_wod_phases").select("id,phase_key,start_date,end_date").lte("start_date", today).gte("end_date", today).maybeSingle<WodPhase>();
  if (phaseError) throw new Error("Could not load Daily WOD phase. Check the new migration and reload.");

  let userResult = null;
  if (user && workout) {
    const { data } = await supabase
      .from("results")
      .select("*")
      .eq("workout_id", workout.id)
      .eq("user_id", user.id)
      .single();
    const { data: setLog, error: setLogError } = data
      ? await supabase
          .from("wod_exercise_logs")
          .select("exercise_entries")
          .eq("result_id", data.id)
          .eq("user_id", user.id)
          .maybeSingle()
      : { data: null, error: null };
    if (setLogError)
      throw new Error(
        "Could not load your exercise log. Check the latest migration.",
      );
    userResult = data
      ? { ...data, exercise_entries: setLog?.exercise_entries || [] }
      : null;
  }

  // Top 5 results for today (only if logged in)
  let topResults: ResultWithProfile[] = [];
  if (user && workout) {
    const { data } = await supabase
      .from("results")
      .select(
        `
        *,
        profiles (display_name)
      `,
      )
      .eq("workout_id", workout.id)
      .order("completion_time_seconds", { ascending: true, nullsFirst: false })
      .limit(5)
      .returns<ResultWithProfile[]>();
    topResults = data || [];
  }

  return (
    <div className="space-y-8">
      {user && <ContinuePlans userId={user.id} savedPlan={saved.savedPlan} savedSession={saved.savedSession} />}
      {user && <GettingStarted key={user.id} initiallyDismissed={!!onboarding?.dismissed_at} />}

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Today&apos;s WOD</h1>
        <p className="mt-1 text-zinc-400">{formatDate(today)}</p>
      </div>

      <WodPhaseGuide phase={phase} date={today} />
      <nav aria-label="Daily WOD tools" className="flex flex-wrap gap-3">
        <Link href="/workouts" className="min-h-11 rounded-lg border border-zinc-700 px-4 py-3 text-orange-400">History</Link>
        {user && <Link href="/leaderboard" className="min-h-11 rounded-lg border border-zinc-700 px-4 py-3 text-orange-400">Leaderboards</Link>}
        <Link href="/help" className="min-h-11 rounded-lg border border-zinc-700 px-4 py-3 text-zinc-300">Get Help</Link>
      </nav>
      {user && <p className="text-xs text-zinc-400">Beta usage notice: administrators can see your visits, page paths, recent activity times, and saved activity counts. We do not record typed input or screen recordings.</p>}

      {!workout ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-400">No workout posted for today yet.</p>
          <p className="mt-2 text-sm text-zinc-500">
            {user ? (
              <>
                Browse{" "}
                <Link href="/plans" className="text-orange-400 hover:underline">
                  training plans
                </Link>{" "}
                or check the{" "}
                <Link
                  href="/workouts"
                  className="text-orange-400 hover:underline"
                >
                  history
                </Link>
                .
              </>
            ) : (
              <>
                <Link href="/plans" className="text-orange-400 hover:underline">
                  Browse training plans
                </Link>{" "}
                or check back later.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* WOD Card */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-orange-400">
                  {workout.title}
                </h2>
                <span className="mt-1 inline-block rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-zinc-300">
                  {workout.workout_type.replace("_", " ")}
                </span>
              </div>
              {workout.time_cap_seconds && (
                <div className="text-right text-sm text-zinc-400">
                  Time Cap
                  <div className="font-mono text-lg text-zinc-200">
                    {formatTime(workout.time_cap_seconds)}
                  </div>
                </div>
              )}
            </div>

            <p className="mt-4 text-sm text-zinc-400">Daily community workout</p>
            {userResult && <p className="mt-4 text-orange-300" role="status">✓ Workout completed{saved.savedWod === workout.id ? ' and saved' : ''}</p>}
            <Link href={`/workouts/${workout.id}`} className="ss-primary mt-5 w-full">{userResult ? 'Review Workout' : 'View Workout'} →</Link>
          </div>
        
          {/* Mini Leaderboard */}
          {user && topResults.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Top Results</h3>
                <Link
                  href="/leaderboard"
                  className="text-sm text-orange-400 hover:underline"
                >
                  Full leaderboard →
                </Link>
              </div>
              <div className="space-y-2">
                {topResults.map((r, i) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-4 py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center font-mono text-sm text-zinc-500">
                        {i + 1}
                      </span>
                      <span className="font-medium">
                        {r.profiles?.display_name || "Athlete"}
                      </span>
                      {!r.is_rx && (
                        <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300">
                          Scaled
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-orange-400">
                      {workout.workout_type === "amrap"
                        ? `${r.rounds || 0} + ${r.extra_reps || 0}`
                        : formatTime(r.completion_time_seconds)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
