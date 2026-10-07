import { WorkoutRunner } from "@/components/WorkoutRunner";
import { workoutSections, trainingProgress } from "@/lib/workout-sections";
import {
  suggestion,
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
import { UndoCompletion } from "@/components/ProgramControls";
import { CompletionCelebration } from "@/components/CompletionCelebration";
import { ProgramSchedulePreview } from "@/components/ProgramSchedulePreview";
import { DownloadProgram } from "@/components/DownloadProgram";

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
  const workoutProgress = trainingProgress(ordered, [...done]);
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
      </div>
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
                    const sectionRules = result ? result.prescriptions_snapshot : session.prescriptions || [];
                    const sections = workoutSections(session.description, session.exercises || [], sectionRules, plan.equipment_required || []);
                    return <article id={`session-${session.id}`} key={`${selectedAttempt}-${session.id}`} className="scroll-mt-24">
                      <WorkoutRunner
                        key={`${selectedAttempt}-${session.id}-${result?.id || 'new'}-${result?.revision || 0}`}
                        title={session.title}
                        subtitle={`${plan.title} / Week ${session.week_number} / Day ${session.day_number}`}
                        sections={sections}
                        equipment={plan.equipment_required || []}
                        notes={session.notes}
                        estimatedMinutes={session.estimated_minutes}
                        target={{ kind: 'plan', planId: id, enrollmentId: enrollment.id, sessionId: session.id, attempt: selectedAttempt }}
                        existing={result}
                        existingLogs={resultLogs}
                        suggestions={Object.fromEntries(sectionRules.map(rule => [rule.id, suggestion(rule, records, logs.filter(log => earlierResults.has(log.result_id)))]))}
                        progress={workoutProgress}
                        nextUrl={nextSession ? `/plans/${id}?day=${nextSession.id}` : undefined}
                        editable={!!result || (!archived && enrollment.is_following && enrollment.status !== 'paused')}
                        rest={session.session_type === 'rest'}
                        previewFooter={<>
                          <ProgramSchedulePreview
                            key={`${id}-${selectedAttempt}-${session.week_number}`}
                            sessions={ordered}
                            initialWeek={session.week_number}
                            planId={id}
                            attempt={selectedAttempt}
                            selectedId={session.id}
                            completedIds={[...done]}
                          />
                          {result && !archived && enrollment.is_following && <UndoCompletion enrollmentId={enrollment.id} resultId={result.id} />}
                          {!archived && enrollment.is_following && enrollment.status !== 'paused' && <DownloadProgram planId={id} />}
                        </>}
                      />
                    </article>;
                  })}
              </div>
            ))}
        </section>
      )}
    </div>
  );
}
