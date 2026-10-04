import type { PlanImport } from "./plan-import";

export function reviewPlan(plan: PlanImport) {
  const sessions = plan.sessions;
  const counts = { workout: 0, rest: 0, recovery: 0, test: 0 };
  const warnings = [...plan.review_notes];
  let textOnly = 0;
  const weeks = Array.from({ length: plan.plan.duration_weeks }, (_, i) => {
    const number = i + 1,
      days = sessions.filter((s) => s.week_number === number);
    const missing = Array.from({ length: 7 }, (_, d) => d + 1).filter(
      (d) => !days.some((s) => s.day_number === d),
    );
    return { number, sessions: days, missing };
  });
  for (const s of sessions) {
    counts[s.session_type as keyof typeof counts]++;
    if (
      s.session_type !== "rest" &&
      !s.exercises.length &&
      !s.prescriptions.length
    )
      textOnly++;
    if (
      s.session_type === "rest" &&
      (s.exercises.length || s.prescriptions.length)
    )
      warnings.push(
        `Week ${s.week_number}, day ${s.day_number}: rest day has tracking fields. Verify its session type.`,
      );
    if (
      /\b(option|choose|either|alternative)\b/i.test(
        `${s.description ?? ""} ${s.notes ?? ""}`,
      )
    )
      warnings.push(
        `Week ${s.week_number}, day ${s.day_number}: instructions may contain alternatives. Check that tracking fields match the option athletes should perform.`,
      );
  }
  if (textOnly)
    warnings.push(
      `${textOnly} non-rest session(s) have text instructions only. Clear numbered exercises may be prepared at logging time; alternatives and ambiguous sets need review. Automatic load targets are never inferred from text.`,
    );
  if (weeks.some((w) => w.missing.length))
    warnings.push(
      "Unlisted days are not explicit scheduled rest sessions. Verify the gaps below; add rest sessions to the file if the program calls for them.",
    );
  const references = [
    ...new Set(
      sessions.flatMap((s) => s.prescriptions.map((r) => r.record_key)),
    ),
  ];
  return {
    counts,
    textOnly,
    weeks,
    references,
    warnings: [...new Set(warnings)],
    exercises: sessions.reduce((n, s) => n + s.exercises.length, 0),
    targets: sessions.reduce((n, s) => n + s.prescriptions.length, 0),
  };
}
