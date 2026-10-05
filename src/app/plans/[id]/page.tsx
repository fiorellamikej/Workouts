import { definitionsFromText } from "@/lib/exercise-logging";
import { PersonalizedTargets } from "@/components/PersonalizedTargets";
import {
  outcomeText,
  timeText,
  type AthleteRecord,
  type ExerciseLog,
} from "@/lib/training";
import type {
  UserPlanEnrollment,
  PlanResult,
  PlanSession,
} from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { EnrollButton } from "@/components/EnrollButton";
import { LogPlanResultForm } from "@/components/LogPlanResultForm";
import { ProgramControls, UndoCompletion } from "@/components/ProgramControls";
import { CompletionCelebration } from "@/components/CompletionCelebration";
import { WorkoutHistoryPicker } from "@/components/WorkoutHistoryPicker";
import { ProgramSchedulePreview } from "@/components/ProgramSchedulePreview";
import { formatTime } from "@/lib/utils";

export default async function PlanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string; day?: string; celebrate?: string }>;
}) {
  const { id } = await params,
    { run, day, celebrate } = await searchParams,
    db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const { data: plan, error: planError } = await db
    .from("training_plans")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (planError) throw new Error("Could not load program. Please retry.");
  if (!plan) notFound();
  const { data: sessions, error: sessionsError } = await db
    .from("plan_sessions")
    .select("*")
    .eq("plan_id", id)
    .order("order_index")
    .order("week_number")
    .order("day_number")
    .order("id")
    .returns<PlanSession[]>();
  if (sessionsError) throw new Error("Could not load sessions. Please retry.");
  const ordered = sessions || [];
  let enrollment: UserPlanEnrollment | null = null,
    records: AthleteRecord[] = [],
    results: PlanResult[] = [],
    logs: ExerciseLog[] = [];
  let selectedAttempt = 1;
  if (user) {
    const [recordQuery, enrollmentQuery] = await Promise.all([
      db
        .from("athlete_records")
        .select("*")
        .eq("user_id", user.id)
        .returns<AthleteRecord[]>(),
      db
        .from("user_plan_enrollments")
        .select("*")
        .eq("user_id", user.id)
        .eq("plan_id", id)
        .maybeSingle<UserPlanEnrollment>(),
    ]);
    if (recordQuery.error || enrollmentQuery.error)
      throw new Error(
        "Could not load your records or program progress. Check the new migration.",
      );
    records = recordQuery.data || [];
    enrollment = enrollmentQuery.data;
    if (enrollment) {
      const requested = Number(run);
      selectedAttempt =
        Number.isInteger(requested) &&
        requested > 0 &&
        requested <= enrollment.current_attempt
          ? requested
          : enrollment.current_attempt;
      const [resultQuery, logQuery] = await Promise.all([
        db
          .from("plan_results")
          .select("*")
          .eq("enrollment_id", enrollment.id)
          .eq("attempt", selectedAttempt)
          .returns<PlanResult[]>(),
        db
          .from("training_exercise_logs")
          .select("*, plan_results!inner(attempt)")
          .eq("enrollment_id", enrollment.id)
          .eq("plan_results.attempt", selectedAttempt)
          .order("created_at", { ascending: false })
          .returns<ExerciseLog[]>(),
      ]);
      if (resultQuery.error || logQuery.error)
        throw new Error("Could not load workout history. Please retry.");
      results = resultQuery.data || [];
      logs = logQuery.data || [];
    }
  }
  if (!enrollment) redirect(`/plans/${id}/overview`);
  const archived =
    !!enrollment && selectedAttempt !== enrollment.current_attempt;
  const done = new Set(results.map((r) => r.session_id)),
    firstUnfinished = ordered.find((s) => !done.has(s.id));
  const selected =
    ordered.find((s) => s.id === day) ||
    (archived
      ? ordered.find((s) => done.has(s.id)) || ordered[0]
      : ordered.find((s) => s.id === enrollment?.current_session_id) ||
        firstUnfinished ||
        ordered[ordered.length - 1]);
  const celebrationResult =
    !archived &&
    enrollment.is_following &&
    results.find((r) => r.id === celebrate && r.session_id === selected?.id);
  const nextSession = ordered.find((s) => !done.has(s.id));
  const percent = ordered.length
    ? Math.round((done.size / ordered.length) * 100)
    : 0;
  const weeks = [...new Set(ordered.map((s) => s.week_number))].sort(
    (a, b) => a - b,
  );
  return (
    <div className="space-y-8">
      <div>
        <Link href="/plans" className="text-sm text-zinc-400">
          ← Training Programs
        </Link>
        <Link
          href={`/plans/${id}/overview`}
          className="ml-4 text-sm text-orange-400"
        >
          Program overview
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-orange-400">
          {plan.title}
        </h1>
        {plan.goal && <p className="mt-1 text-lg text-zinc-300">{plan.goal}</p>}
        <p className="mt-2 text-sm text-zinc-400">
          {plan.duration_weeks} weeks · {plan.difficulty}
        </p>
      </div>
      <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        {user ? (
          enrollment ? (
            <>
              <h2 className="text-lg font-semibold">
                {archived
                  ? `Run ${selectedAttempt} history`
                  : done.size === ordered.length && ordered.length
                    ? "Program complete!"
                    : enrollment.status === "paused"
                      ? "Program paused"
                      : "Your Program Progress"}
              </h2>
              <p className="text-sm text-zinc-400">
                Run {selectedAttempt} · {done.size}/{ordered.length} sessions
                completed · {percent}%
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full bg-orange-500"
                  style={{ width: `${percent}%` }}
                />
              </div>
              {!archived && enrollment.is_following && (
                <ProgramControls
                  enrollmentId={enrollment.id}
                  planId={id}
                  attempt={enrollment.current_attempt}
                  sessions={ordered.map((s) => ({
                    id: s.id,
                    title: s.title,
                    week_number: s.week_number,
                    day_number: s.day_number,
                  }))}
                  selectedId={selected?.id || null}
                />
              )}
              {(!enrollment.is_following || archived) && (
                <WorkoutHistoryPicker
                  planId={id}
                  attempt={selectedAttempt}
                  sessions={ordered}
                  selectedId={selected?.id || ""}
                />
              )}
              {!enrollment.is_following && (
                <p className="text-sm text-zinc-400">
                  You left this program. Your results are saved.{" "}
                  <Link
                    href={`/plans/${id}/overview`}
                    className="text-orange-400"
                  >
                    Rejoin from its overview →
                  </Link>
                </p>
              )}
              {!archived && selected && !celebrationResult && (
                <Link
                  className="inline-block text-orange-400"
                  href={`#session-${selected.id}`}
                >
                  Go to selected day: {selected.title} →
                </Link>
              )}
              {enrollment.current_attempt > 1 && (
                <div className="space-y-2">
                  <p className="text-sm text-zinc-400">
                    Run history  -  earlier results stay separate from current
                    progression.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(
                      { length: enrollment.current_attempt },
                      (_, i) => i + 1,
                    ).map((n) => (
                      <Link
                        key={n}
                        className={`rounded-lg px-3 py-2 text-sm ${n === selectedAttempt ? "bg-orange-600" : "bg-zinc-800"}`}
                        href={
                          n === enrollment.current_attempt
                            ? `/plans/${id}`
                            : `/plans/${id}?run=${n}`
                        }
                      >
                        Run {n}
                        {n === enrollment.current_attempt ? " (current)" : ""}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p>Ready to start this program?</p>
              <EnrollButton planId={id} />
            </div>
          )
        ) : (
          <p>
            <Link href="/auth/login" className="text-orange-400">
              Log in
            </Link>{" "}
            to follow this plan and save your progress.
          </p>
        )}
      </section>
      <ProgramSchedulePreview
        key={`${id}-${selectedAttempt}-${selected?.week_number || 1}`}
        sessions={ordered}
        initialWeek={selected?.week_number}
        openByDefault
        planId={id}
        attempt={selectedAttempt}
        selectedId={selected?.id}
        completedIds={[...done]}
      />
      {celebrationResult ? (
        <CompletionCelebration
          planId={id}
          resultId={celebrationResult.id}
          completedSessionId={selected!.id}
          completedTitle={selected!.title}
          completedCount={done.size}
          totalCount={ordered.length}
          nextSession={
            nextSession
              ? {
                  id: nextSession.id,
                  title: nextSession.title,
                  description: nextSession.description,
                  notes: nextSession.notes,
                  week_number: nextSession.week_number,
                  day_number: nextSession.day_number,
                }
              : null
          }
        />
      ) : (
        <section className="space-y-6">
          <h2 className="text-xl font-semibold">
            {archived || !enrollment.is_following
              ? "Saved Workout"
              : "Your Selected Workout"}
          </h2>
          {weeks
            .filter((week) => week === selected?.week_number)
            .map((week) => (
              <div key={week} className="space-y-3">
                <h3 className="text-lg text-zinc-300">Week {week}</h3>
                {ordered
                  .filter((s) => s.id === selected?.id)
                  .map((session) => {
                    const result = results.find(
                        (r) => r.session_id === session.id,
                      ),
                      resultLogs = result
                        ? logs.filter((l) => l.result_id === result.id)
                        : [];
                    const earlierSessions = new Set(
                      ordered
                        .slice(
                          0,
                          ordered.findIndex((s) => s.id === session.id),
                        )
                        .map((s) => s.id),
                    );
                    const earlierResults = new Set(
                      results
                        .filter((r) => earlierSessions.has(r.session_id))
                        .map((r) => r.id),
                    );
                    const isSelected = !archived && selected?.id === session.id;
                    return (
                      <article
                        id={`session-${session.id}`}
                        key={`${selectedAttempt}-${session.id}`}
                        className={`scroll-mt-24 space-y-3 rounded-xl border p-5 ${isSelected ? "border-orange-500" : result ? "border-green-800/50" : "border-zinc-800"} ${result ? "bg-green-950/20" : "bg-zinc-900/50"}`}
                      >
                        <p className="text-xs text-zinc-400">
                          Day {session.day_number} · {session.session_type}
                          {result ? " · Completed" : ""}
                          {isSelected ? " · Selected day" : ""}
                        </p>
                        <h4 className="font-semibold">{session.title}</h4>
                        {session.description && (
                          <p className="whitespace-pre-wrap text-sm text-zinc-300">
                            {session.description}
                          </p>
                        )}
                        {user &&
                          enrollment.is_following &&
                          !result &&
                          !archived && (
                            <PersonalizedTargets
                              rules={session.prescriptions || []}
                              records={records}
                              logs={logs.filter((l) =>
                                earlierResults.has(l.result_id),
                              )}
                            />
                          )}
                        {session.notes && (
                          <p className="text-xs text-zinc-400">
                            {session.notes}
                          </p>
                        )}
                        {result && (
                          <div className="space-y-2 text-sm">
                            <p className="text-orange-400">
                              Logged:{" "}
                              {result.completion_time_seconds != null
                                ? formatTime(result.completion_time_seconds)
                                : result.rounds != null
                                  ? `${result.rounds} + ${result.extra_reps || 0}`
                                  : "Done"}
                              {result.weight_used
                                ? ` · ${result.weight_used}`
                                : ""}
                            </p>
                            {resultLogs.map((l) => (
                              <p key={l.id}>
                                {l.label} · {l.sets} × {l.reps} ·{" "}
                                {l.unit === "seconds"
                                  ? timeText(Number(l.value))
                                  : `${l.value} ${l.unit}`}{" "}
                                · {outcomeText(l.outcome)}
                              </p>
                            ))}
                            {(result.exercise_entries || []).map((e) => (
                              <div
                                key={e.id}
                                className="rounded-lg bg-zinc-900 p-3"
                              >
                                <p className="font-medium">{e.label}</p>
                                {e.sets.map((s, i) => (
                                  <p key={i}>
                                    Set {i + 1}: {s.reps ?? "N/A"} reps ·{" "}
                                    {s.weight == null
                                      ? "N/A"
                                      : `${s.weight} ${e.unit}`}
                                    {s.rpe != null ? ` · RPE ${s.rpe}` : ""}
                                    {s.completed ? " ✓" : ""}
                                  </p>
                                ))}
                              </div>
                            ))}
                            {result.notes && (
                              <p className="whitespace-pre-wrap text-zinc-400">
                                {result.notes}
                              </p>
                            )}
                          </div>
                        )}
                        {enrollment &&
                          (result ||
                            (!archived &&
                              enrollment.is_following &&
                              enrollment.status !== "paused")) && (
                            <div className="space-y-3 border-t border-zinc-800 pt-3">
                              <LogPlanResultForm
                                key={`${selectedAttempt}-${session.id}-${result?.id || "new"}`}
                                exercises={
                                  session.exercises?.length
                                    ? session.exercises
                                    : definitionsFromText(session.description)
                                }
                                planId={id}
                                enrollmentId={enrollment.id}
                                sessionId={session.id}
                                attempt={selectedAttempt}
                                rules={
                                  result
                                    ? result.prescriptions_snapshot
                                    : session.prescriptions || []
                                }
                                existing={result}
                                existingLogs={resultLogs}
                              />
                              {result &&
                                !archived &&
                                enrollment.is_following && (
                                  <UndoCompletion
                                    enrollmentId={enrollment.id}
                                    resultId={result.id}
                                  />
                                )}
                            </div>
                          )}
                        {archived && !result && (
                          <p className="text-sm text-zinc-500">
                            No completed result in this run.
                          </p>
                        )}
                      </article>
                    );
                  })}
              </div>
            ))}
        </section>
      )}
    </div>
  );
}
