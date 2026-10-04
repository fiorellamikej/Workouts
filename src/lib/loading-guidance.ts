import { RECORDS, progressionAmounts, type Prescription } from "./training";

export function loadingGuidance(rule: Prescription): string[] {
  const reference = RECORDS[rule.record_key];
  if (reference.kind === "time")
    return [
      `Uses ${rule.percent}% of your most recently dated ${reference.label} time, rounded to the nearest second. This is elapsed time, not a percentage of speed: above 100% means a slower target.`,
      "Use the same distance as the reference record. Update your profile when your current capability changes.",
    ];
  const lines = [
    `${rule.percent}% of your most recently dated ${reference.label} 1-rep max is the ${rule.strategy === "previous" ? "starting target when no matching exercise result exists" : "target for this session"}. Units are converted to ${rule.unit}. An older all-time PR is not used in place of your latest record.`,
    `Round down to increments of ${rule.rounding} ${rule.unit} of total load. For a barbell, the displayed weight includes the bar and all plates; the increment is across both sides combined. For other equipment, follow the workout’s loading convention and log it consistently.`,
  ];
  if (rule.strategy === "previous") {
    const a = progressionAmounts(rule),
      unit = a.mode === "percentage" ? "%" : ` ${rule.unit}`;
    lines.push(
      `After all prescribed sets and reps: hard completion adds ${a.hard}${unit}; comfortable completion adds ${a.comfortable}${unit}. Missed reps repeat the actual logged load. ${a.mode === "percentage" ? "Percentage increases use your actual last load, not your 1-rep max." : "These are fixed total-load increases."}`,
    );
    lines.push(
      "Progression uses the latest matching exercise name, reference lift, sets and reps in your program logs. Rounding can leave a small increase unchanged. A blank exercise result saves completion without advancing load. RPE and added reps do not automatically change this target.",
    );
  } else
    lines.push(
      "This percentage target is recalculated from your profile record. Logging an exercise result does not automatically increase this prescribed percentage.",
    );
  return lines;
}
