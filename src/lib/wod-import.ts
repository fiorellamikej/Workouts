import { PHASES, WOD_TYPES, validDate, shiftDate, dayDifference, type PhaseKey, type WodType } from "./daily-wod";
import { RECORDS, validatePrescriptions, type Prescription } from "./training";
export type ImportedWod = { workout_date: string; title: string; description: string; workout_type: WodType; time_cap_seconds: number | null; notes: string | null; prescriptions: Prescription[] };
export type WodImport = { schema_version: 1; phase: { key: PhaseKey; start_date: string; end_date: string }; workouts: ImportedWod[]; warnings: string[] };
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number, required = false): string | null {
  if (value == null && !required) return null;
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new Error(`${label} must be ${required ? "nonempty " : ""}text, at most ${max} characters.`);
  return value.trim().replace(/\u2014/g, "-") || null;
}
export function normalizeWodImport(input: unknown, selectedPhase: PhaseKey = "base"): WodImport {
  const root = object(input, "File");
  if (root.schema_version !== 1) throw new Error("Expected Daily WOD schema_version 1.");
  const phaseMeta = root.phase === undefined ? null : object(root.phase, "Phase");
  const key = phaseMeta?.key ?? selectedPhase;
  if (typeof key !== "string" || !Object.hasOwn(PHASES, key)) throw new Error("Select a supported phase.");
  if (!Array.isArray(root.workouts) || !root.workouts.length || root.workouts.length > 56) throw new Error("A phase must contain 1–56 dated entries.");
  const warnings: string[] = [];
  const seen = new Set<string>();
  const workouts = root.workouts.map((entry, i): ImportedWod => {
    const w = object(entry, `Day ${i + 1}`);
    if (!validDate(w.workout_date)) throw new Error(`Day ${i + 1}: use a real YYYY-MM-DD date between 2000 and 2100.`);
    if (seen.has(w.workout_date)) throw new Error(`Duplicate workout date: ${w.workout_date}.`);
    seen.add(w.workout_date);
    if (!WOD_TYPES.includes(w.workout_type as WodType)) throw new Error(`${w.workout_date}: unsupported workout_type.`);
    const cap = w.time_cap_seconds ?? null;
    if (cap !== null && (typeof cap !== "number" || !Number.isInteger(cap) || cap < 1 || cap > 86400)) throw new Error(`${w.workout_date}: time cap must be 1–86400 seconds or null.`);
    if (w.prescriptions != null && !Array.isArray(w.prescriptions)) throw new Error(`${w.workout_date}: prescriptions must be a list.`);
    const rules = (w.prescriptions ?? []) as unknown[];
    if (rules.length > 40) throw new Error("Maximum 40 personalized targets per WOD.");
    const prescriptions = rules.map((rule): Prescription => {
      const r = object(rule, "Target");
      const recordKey = r.record_key === "press" ? "overhead_press" : r.record_key;
      if (r.record_key === "press") warnings.push(`${w.workout_date}: press reference maps to your overhead press profile record. Confirm it is appropriate for the described movement.`);
      if (typeof recordKey !== "string" || !Object.hasOwn(RECORDS, recordKey)) throw new Error(`${w.workout_date}: unknown profile reference.`);
      if (r.strategy !== "percent") throw new Error(`${w.workout_date}: Daily WODs use percent targets. Previous-performance progression belongs to training plans.`);
      if (r.unit !== "lb" && r.unit !== "kg") throw new Error("Target unit must be lb or kg.");
      for (const field of ["percent", "sets", "reps", "rounding", "increment"]) if (typeof r[field] !== "number" || !Number.isFinite(r[field])) throw new Error(`Target ${field} must be a number.`);
      if (r.progression_mode !== undefined && r.progression_mode !== "fixed" && r.progression_mode !== "percentage") throw new Error("Invalid target progression mode.");
      if (r.comfortable_increment !== undefined && (typeof r.comfortable_increment !== "number" || !Number.isFinite(r.comfortable_increment))) throw new Error("Comfortable increment must be a number.");
      return { id: text(r.id, "Target ID", 100, true)!, label: text(r.label, "Target label", 100, true)!, record_key: recordKey, sets: r.sets, reps: r.reps, percent: r.percent, strategy: "percent", increment: r.increment, unit: r.unit, rounding: r.rounding, ...(r.progression_mode !== undefined ? { progression_mode: r.progression_mode } : {}), ...(r.comfortable_increment !== undefined ? { comfortable_increment: r.comfortable_increment } : {}) } as Prescription;
    });
    const invalid = validatePrescriptions(prescriptions);
    if (invalid) throw new Error(`${w.workout_date}: ${invalid}`);
    if (w.workout_type === "rest" && prescriptions.length) throw new Error(`${w.workout_date}: rest days cannot have personalized targets.`);
    const description = text(w.description, "Workout instructions", 30000, true)!;
    if (prescriptions.length) warnings.push(`${w.workout_date}: targets use profile records, not today's heavy set. Review percentage targets against the full instructions, especially variants such as front squat or push press.`);
    return { workout_date: w.workout_date, title: text(w.title, "Title", 200, true)!, workout_type: w.workout_type as WodType, description, time_cap_seconds: cap as number | null, notes: text(w.notes, "Notes", 10000), prescriptions };
  }).sort((a, b) => a.workout_date.localeCompare(b.workout_date));
  const expected = key === "deload" ? workouts.length : 56;
  if (key === "deload" ? expected < 7 || expected > 14 : workouts.length !== 56) throw new Error(key === "deload" ? "Deload must contain 7–14 calendar days." : "This phase must contain exactly 56 calendar days, including rest days.");
  const start = workouts[0].workout_date, end = workouts[workouts.length - 1].workout_date;
  if (dayDifference(end, start) + 1 !== workouts.length) throw new Error("Dates must be consecutive. Include explicit rest days instead of leaving gaps.");
  if (phaseMeta && ((phaseMeta.start_date !== undefined && phaseMeta.start_date !== start) || (phaseMeta.end_date !== undefined && phaseMeta.end_date !== end))) throw new Error("Phase dates do not match the workout dates.");
  return { schema_version: 1, phase: { key: key as PhaseKey, start_date: start, end_date: end }, workouts, warnings: [...new Set(warnings)] };
}
export function parseWodImport(contents: string, phase: PhaseKey): WodImport {
  if (contents.length > 5 * 1024 * 1024) throw new Error("Maximum file size is 5 MB.");
  let value: unknown;
  try { value = JSON.parse(contents.replace(/^\uFEFF/, "")); } catch { throw new Error("Invalid JSON. Upload a Daily WOD JSON file, not a ZIP or training-plan file."); }
  return normalizeWodImport(value, phase);
}
export function rebaseWodImport(value: WodImport, start: string): WodImport {
  if (!validDate(start)) throw new Error("Select a valid start date.");
  const delta = dayDifference(start, value.phase.start_date);
  const result = normalizeWodImport({ schema_version: 1, phase: { key: value.phase.key }, workouts: value.workouts.map((w) => ({ ...w, workout_date: shiftDate(w.workout_date, delta) })) });
  return { ...result, warnings: [...new Set([...value.warnings, ...result.warnings])] };
}
