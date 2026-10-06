import { WodPhaseGuide } from "@/components/WodPhaseGuide";
import type { WodPhase } from "@/lib/daily-wod";
import { WorkoutRunner } from "@/components/WorkoutRunner";
import { workoutSections } from "@/lib/workout-sections";
import { suggestion } from "@/lib/training";
import type { AthleteRecord } from "@/lib/training";
import type { ResultWithProfile } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTime } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function WorkoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: workout } = await supabase
    .from("workouts")
    .select("*")
    .eq("id", id)
    .single();

  if (!workout) notFound();

  const { data: phase, error: phaseError } = workout.phase_id
    ? await supabase.from("daily_wod_phases").select("id,phase_key,start_date,end_date").eq("id", workout.phase_id).maybeSingle<WodPhase>()
    : { data: null, error: null };
  if (phaseError) throw new Error("Could not load the Daily WOD phase. Please reload.");

  const { data: records, error: recordsError } = user
    ? await supabase
        .from("athlete_records")
        .select("*")
        .eq("user_id", user.id)
        .returns<AthleteRecord[]>()
    : { data: [], error: null };

  let userResult = null;
  if (user) {
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

  let leaderboard: ResultWithProfile[] = [];
  if (user) {
    const { data } = await supabase
      .from("results")
      .select(`*, profiles (display_name)`)
      .eq("workout_id", workout.id)
      .order("completion_time_seconds", { ascending: true, nullsFirst: false })
      .limit(20)
      .returns<ResultWithProfile[]>();
    leaderboard = data || [];
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/workouts"
          className="text-sm text-zinc-400 hover:text-white"
        >
          ← History
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-orange-400">
          {workout.title}
        </h1>
        <p className="mt-1 text-zinc-400">{formatDate(workout.workout_date)}</p>
      </div>

      <WodPhaseGuide phase={phase} date={workout.workout_date} />

      {user && !recordsError ? <WorkoutRunner
        key={`${workout.id}-${userResult?.id || 'new'}`}
        title={workout.title}
        subtitle={`Daily WOD / ${formatDate(workout.workout_date)}${workout.time_cap_seconds ? ` / Time cap: ${Math.floor(workout.time_cap_seconds / 60)}:${String(workout.time_cap_seconds % 60).padStart(2, '0')}` : ''}`}
        sections={workoutSections(workout.description, [], workout.prescriptions || [])}
        notes={workout.notes}
        target={{ kind: 'wod', workoutId: workout.id, workoutType: workout.workout_type }}
        existing={userResult}
        suggestions={Object.fromEntries((workout.prescriptions || []).map((rule: import('@/lib/training').Prescription) => [rule.id, suggestion(rule, records || [])]))}
        rest={workout.workout_type === 'rest'}
      /> : <section className="ss-panel space-y-4"><p className="whitespace-pre-wrap text-zinc-300">{workout.description}</p><p>{recordsError ? 'Could not load personalized targets. Refresh before logging.' : <><Link href="/auth/login" className="text-orange-300">Log in</Link> to start and log this workout.</>}</p></section>}

      {user && leaderboard.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h3 className="text-lg font-semibold mb-4">Leaderboard</h3>
          <div className="space-y-2">
            {leaderboard.map((r, i) => (
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
  );
}
