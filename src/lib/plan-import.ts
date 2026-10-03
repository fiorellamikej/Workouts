import {
  validateDefinitions,
  type ExerciseDefinition,
} from "./exercise-logging";
import {
  RECORDS,
  validatePrescriptions,
  type Prescription,
} from "@/lib/training";

export type PlanImport = {
  format: "sword-shield-plan";
  version: 1;
  plan: {
    title: string;
    description: string | null;
    goal: string | null;
    duration_weeks: number;
    difficulty: string;
    equipment_required: string[];
    equipment_suggested: string[];
    fitness_guidance: string | null;
    tags: string[];
    is_published: false;
  };
  sessions: {
    id: null;
    week_number: number;
    day_number: number;
    title: string;
    description: string | null;
    session_type: string;
    estimated_minutes: number | null;
    notes: string | null;
    order_index: number;
    exercises: ExerciseDefinition[];
    prescriptions: Prescription[];
  }[];
  review_notes: string[];
};
function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${name} must be an object.`);
  return value as Record<string, unknown>;
}
function text(
  value: unknown,
  name: string,
  max: number,
  required = false,
): string | null {
  if (value == null && !required) return null;
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new Error(
      `${name} must be ${required ? "nonempty " : ""}text, at most ${max} characters.`,
    );
  return value.trim() || null;
}
function integer(
  value: unknown,
  name: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  return value;
}
function strings(
  value: unknown,
  name: string,
  maxItems: number,
  maxLength: number,
): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > maxItems)
    throw new Error(`${name} has too many entries or is not a list.`);
  return value.map((v, i) => text(v, `${name} ${i + 1}`, maxLength, true)!);
}
function prescriptions(value: unknown, session: string): Prescription[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 40)
    throw new Error(`${session}: maximum 40 personalized targets.`);
  const rules = value.map((v, i) => {
    const r = object(v, `${session} target ${i + 1}`);
    for (const field of ["percent", "increment", "rounding", "sets", "reps"]) {
      if (typeof r[field] !== "number" || !Number.isFinite(r[field]))
        throw new Error(`${session}: target ${field} must be a number.`);
    }
    if (!Object.hasOwn(RECORDS, String(r.record_key)))
      throw new Error(`${session}: unknown reference record.`);
    if (
      !["lb", "kg"].includes(String(r.unit)) ||
      !["percent", "previous"].includes(String(r.strategy))
    )
      throw new Error(`${session}: invalid target unit or strategy.`);
    if (
      r.progression_mode !== undefined &&
      !["fixed", "percentage"].includes(String(r.progression_mode))
    )
      throw new Error(`${session}: invalid progression mode.`);
    if (
      r.comfortable_increment !== undefined &&
      (typeof r.comfortable_increment !== "number" ||
        !Number.isFinite(r.comfortable_increment))
    )
      throw new Error(`${session}: comfortable increase must be a number.`);
    return {
      id: text(r.id, "Target ID", 100, true)!,
      label: text(r.label, "Exercise label", 100, true)!,
      record_key: text(r.record_key, "Reference record", 30, true),
      sets: r.sets,
      reps: r.reps,
      percent: r.percent,
      strategy: r.strategy,
      increment: r.increment,
      unit: r.unit,
      rounding: r.rounding,
      ...(r.progression_mode !== undefined
        ? { progression_mode: r.progression_mode }
        : {}),
      ...(r.comfortable_increment !== undefined
        ? { comfortable_increment: r.comfortable_increment }
        : {}),
    } as Prescription;
  });
  const error = validatePrescriptions(rules);
  if (error) throw new Error(`${session}: ${error}`);
  return rules;
}
// Whitelist import fields. Imported IDs and published status never reach the database.
export function normalizePlanImport(input: unknown): PlanImport {
  const root = object(input, "Import");
  if (root.format !== "sword-shield-plan" || root.version !== 1)
    throw new Error("Expected Sword and Shield plan format, version 1.");
  const p = object(root.plan, "Plan");
  const duration = integer(p.duration_weeks, "Duration", 1, 104);
  const difficulty = p.difficulty ?? "intermediate";
  if (!["beginner", "intermediate", "advanced"].includes(String(difficulty)))
    throw new Error("Invalid plan difficulty.");
  if (
    !Array.isArray(root.sessions) ||
    root.sessions.length < 1 ||
    root.sessions.length > 1000
  )
    throw new Error("Import must contain 1–1000 sessions.");
  const seen = new Set<string>();
  const sessions = root.sessions
    .map((entry, i) => {
      const s = object(entry, `Session ${i + 1}`);
      const week = integer(s.week_number, `Session ${i + 1} week`, 1, duration);
      const day = integer(s.day_number, `Session ${i + 1} day`, 1, 7);
      const slot = `${week}-${day}`;
      if (seen.has(slot))
        throw new Error(
          `Duplicate session for week ${week}, day ${day}. Combine same-day work into one session.`,
        );
      seen.add(slot);
      const type = s.session_type ?? "workout";
      if (!["workout", "rest", "test", "recovery"].includes(String(type)))
        throw new Error(`Session ${i + 1}: invalid session type.`);
      return {
        id: null,
        week_number: week,
        day_number: day,
        title: text(s.title, `Session ${i + 1} title`, 200, true)!,
        description: text(s.description, `Session ${i + 1} description`, 20000),
        session_type: String(type),
        estimated_minutes:
          s.estimated_minutes == null
            ? null
            : integer(s.estimated_minutes, "Estimated minutes", 1, 1440),
        notes: text(s.notes, `Session ${i + 1} notes`, 20000),
        order_index: i,
        exercises: validateDefinitions(s.exercises),
        prescriptions: prescriptions(
          s.prescriptions,
          `Week ${week}, day ${day}`,
        ),
      };
    })
    .sort(
      (a, b) => a.week_number - b.week_number || a.day_number - b.day_number,
    );
  sessions.forEach((s, i) => {
    s.order_index = i;
  });
  const notes = strings(root.review_notes, "Review notes", 200, 2000);
  const weeks = new Set(sessions.map((s) => s.week_number));
  for (let w = 1; w <= duration; w++)
    if (!weeks.has(w))
      notes.push(
        `Week ${w} has no sessions. Confirm that this is intentional.`,
      );
  if (sessions.every((s) => s.prescriptions.length === 0))
    notes.push(
      "No automatic weight/time targets are configured. Workout text is preserved; select and record loads manually.",
    );
  return {
    format: "sword-shield-plan",
    version: 1,
    plan: {
      title: text(p.title, "Plan title", 200, true)!,
      description: text(p.description, "Plan description", 30000),
      goal: text(p.goal, "Plan goal", 500),
      duration_weeks: duration,
      difficulty: String(difficulty),
      equipment_required: [
        ...new Set(
          strings(p.equipment_required, "Required equipment", 30, 100),
        ),
      ],
      equipment_suggested: [
        ...new Set(
          strings(p.equipment_suggested, "Suggested equipment", 30, 100),
        ),
      ],
      fitness_guidance: text(p.fitness_guidance, "Fitness guidance", 2000),
      tags: strings(p.tags, "Tags", 30, 60),
      is_published: false,
    },
    sessions,
    review_notes: [...new Set(notes)].slice(0, 200),
  };
}
export function parsePlanImport(contents: string): PlanImport {
  if (contents.length > 5 * 1024 * 1024)
    throw new Error("Import file must be smaller than 5 MB.");
  let value: unknown;
  try {
    value = JSON.parse(contents.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(
      "Invalid JSON. Use the prepared plan import file, not the PDF or ZIP.",
    );
  }
  return normalizePlanImport(value);
}
