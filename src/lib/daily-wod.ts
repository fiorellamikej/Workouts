export const WOD_TIMEZONE = "America/New_York";
export const WOD_TYPES = ["for_time", "amrap", "emom", "strength", "skill", "intervals", "endurance", "rest", "other"] as const;
export type WodType = (typeof WOD_TYPES)[number];
export const PHASES = {
  base: { label: "Offseason / Base", days: 56, description: "Build the aerobic and muscular engine with more volume, controlled intensity, clean movement mechanics, and consistent training." },
  strength_skill: { label: "Strength & Skill", days: 56, description: "Develop barbell strength, positional control, and gymnastics skills through progressive loading and deliberate practice." },
  pre_competition: { label: "Pre-Competition / Test", days: 56, description: "Combine strength, skills, and conditioning in higher-intensity, multi-modal workouts that prepare you for testing or competition demands." },
  deload: { label: "Deload / Reset", days: 14, description: "Reduce volume and intensity for 1–2 weeks to support recovery and reset after demanding training." },
} as const;
export type PhaseKey = keyof typeof PHASES;
export type WodPhase = { id: string; phase_key: PhaseKey; start_date: string; end_date: string };
export function wodToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: WOD_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "2000-01-01" || value > "2100-12-31") return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function dayDifference(a: string, b: string) { return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000); }
export function shiftDate(date: string, days: number) { return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }
export function phaseProgress(phase: WodPhase, date: string) {
  return { day: dayDifference(date, phase.start_date) + 1, total: dayDifference(phase.end_date, phase.start_date) + 1 };
}
