import catalog from "./hero-catalog.json";
import { parseDuration, timeText } from "./training";
export type HeroWorkout = (typeof catalog)[number];
export const HERO_WORKOUTS = catalog;
export type HeroResult = {
  id: string;
  workout_slug: string;
  performed_on: string;
  is_rx: boolean;
  completion_time_seconds: number | null;
  rounds: number | null;
  extra_reps: number | null;
  notes: string;
  created_at: string;
};
export function heroScore(result: HeroResult) {
  return result.completion_time_seconds != null
    ? timeText(result.completion_time_seconds)
    : `${result.rounds} rounds + ${result.extra_reps} reps`;
}
export function heroPayload(
  workout: HeroWorkout,
  date: string,
  rx: boolean,
  time: string,
  rounds: string,
  extra: string,
  notes: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error("Choose the workout date.");
  if (notes.trim().length > 2000)
    throw new Error("Notes must be at most 2,000 characters.");
  if (!rx && !notes.trim())
    throw new Error(
      "Describe the weights or movement changes used for this scaled workout.",
    );
  if (workout.score_type === "for_time") {
    const seconds = parseDuration(time);
    if (seconds == null)
      throw new Error("Enter a positive finish time in mm:ss, such as 45:30.");
    return {
      performed_on: date,
      is_rx: rx,
      completion_time_seconds: seconds,
      rounds: null,
      extra_reps: null,
      notes: notes.trim(),
    };
  }
  const r = Number(rounds),
    e = Number(extra || "0");
  if (
    !rounds.trim() ||
    !Number.isInteger(r) ||
    r < 0 ||
    r > 10000 ||
    !Number.isInteger(e) ||
    e < 0 ||
    e > 10000
  )
    throw new Error(
      "Enter whole, nonnegative rounds and extra reps (up to 10,000).",
    );
  if (rx && workout.round_reps != null && e >= workout.round_reps)
    throw new Error(
      `A full round has ${workout.round_reps} reps. Count full rounds first, then the remaining reps.`,
    );
  return {
    performed_on: date,
    is_rx: rx,
    completion_time_seconds: null,
    rounds: r,
    extra_reps: e,
    notes: notes.trim(),
  };
}
