export type ExerciseDefinition = {
  id: string;
  label: string;
  sets: number;
  reps: number | null;
  instructions?: string;
};
export type LoggedSet = {
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  completed: boolean;
};
export type ExerciseEntry = {
  id: string;
  label: string;
  unit: "lb" | "kg";
  sets: LoggedSet[];
  duration_seconds?: number | null;
  distance?: number | null;
  distance_unit?: "m" | "km" | "mi";
  notes?: string;
};
export type PreviousExercise = {
  label_key: string;
  entry: ExerciseEntry;
  completed_at: string;
  source: string;
};
export const exerciseKey = (label: string) =>
  label.trim().toLowerCase().replace(/\s+/g, " ");
export function validateDefinitions(value: unknown): ExerciseDefinition[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 100)
    throw new Error("Use at most 100 exercises per workout.");
  const ids = new Set<string>();
  return value.map((v) => {
    if (!v || typeof v !== "object") throw new Error("Invalid exercise.");
    const r = v as ExerciseDefinition;
    if (
      typeof r.id !== "string" ||
      !r.id.trim() ||
      r.id.length > 100 ||
      ids.has(r.id) ||
      typeof r.label !== "string" ||
      !r.label.trim() ||
      r.label.length > 100 ||
      !Number.isInteger(r.sets) ||
      r.sets < 1 ||
      r.sets > 50 ||
      (r.reps !== null &&
        (!Number.isInteger(r.reps) || r.reps < 0 || r.reps > 10000)) ||
      (r.instructions !== undefined &&
        (typeof r.instructions !== "string" || r.instructions.length > 1000))
    )
      throw new Error(
        "Check exercise names, unique IDs, sets (1–50), and reps (0–10000 or null).",
      );
    ids.add(r.id);
    return {
      id: r.id,
      label: r.label.trim(),
      sets: r.sets,
      reps: r.reps,
      instructions: r.instructions || "",
    };
  });
}
export function entriesForSave(entries: ExerciseEntry[]): ExerciseEntry[] {
  return entries.filter(
    (e) =>
      e.label.trim() ||
      e.notes?.trim() ||
      e.duration_seconds != null ||
      e.distance != null ||
      e.sets.some(
        (s) =>
          s.reps != null || s.weight != null || s.rpe != null || s.completed,
      ),
  );
}
export function validateEntries(entries: ExerciseEntry[]) {
  if (
    entries.length > 100 ||
    entries.reduce((n, e) => n + e.sets.length, 0) > 500
  )
    return "Use at most 100 exercises and 500 total sets.";
  const keys = new Set<string>();
  for (const e of entries) {
    const key = exerciseKey(e.label);
    if (!key)
      return `Exercise ${entries.indexOf(e) + 1} needs a name. Name it or remove that exercise card.`;
    if (e.label.length > 100)
      return `Shorten the name for "${e.label.slice(0, 40)}" to 100 characters or fewer.`;
    if (keys.has(key))
      return `"${e.label.trim()}" appears more than once. Add sets to the existing exercise card, or remove the duplicate card.`;
    if (!["lb", "kg"].includes(e.unit))
      return `Choose lb or kg for ${e.label}.`;
    if (!e.sets.length || e.sets.length > 50)
      return `${e.label} needs 1–50 set rows. Use + Set within its exercise card.`;
    if ((e.notes?.length || 0) > 1000)
      return `Shorten the notes for ${e.label} to 1000 characters or fewer.`;
    keys.add(key);
    for (const s of e.sets)
      if (
        (s.reps !== null &&
          (!Number.isInteger(s.reps) || s.reps < 0 || s.reps > 10000)) ||
        (s.weight !== null &&
          (!Number.isFinite(s.weight) ||
            s.weight < 0 ||
            s.weight >= 1000000)) ||
        (s.rpe !== null && (!Number.isFinite(s.rpe) || s.rpe < 1 || s.rpe > 10))
      )
        return `Check reps, weight, and RPE (1–10) for ${e.label}.`;
    if (
      (e.duration_seconds != null &&
        (!Number.isInteger(e.duration_seconds) ||
          e.duration_seconds <= 0 ||
          e.duration_seconds >= 1000000)) ||
      (e.distance != null &&
        (!Number.isFinite(e.distance) ||
          e.distance <= 0 ||
          e.distance >= 1000000))
    )
      return `Check time and distance for ${e.label}.`;
  }
  return null;
}
// Conservative preparation for older text-only programs. Alternatives remain manual.
export function definitionsFromText(
  description: string | null | undefined,
): ExerciseDefinition[] {
  if (!description || /OPTION\s+[A-Z]\s*[—–-]/i.test(description)) return [];
  const rows: ExerciseDefinition[] = [];
  for (const line of description.split("\n")) {
    const row = line.match(/^\s*(\d+)\.\s+(.+?)\s+[–—]\s+(.+)$/);
    if (!row) continue;
    const volume = row[3].match(
      /(?:^|\s)(\d+)\s*[×x]\s*(\d+)(?:\s*[–-]\s*(\d+))?/,
    );
    if (!volume) continue;
    const sets = Number(volume[1]);
    if (sets < 1 || sets > 50 || row[2].length > 100) continue;
    rows.push({
      id: `text-${row[1]}`,
      label: row[2].trim(),
      sets,
      reps: volume[3] ? null : Number(volume[2]),
      instructions: row[3].slice(0, 1000),
    });
  }
  if (new Set(rows.map((r) => exerciseKey(r.label))).size !== rows.length)
    return [];
  return rows;
}
