import { loadingGuidance } from "@/lib/loading-guidance";
import {
  RECORDS,
  suggestion,
  type Prescription,
  type AthleteRecord,
  type ExerciseLog,
} from "@/lib/training";
export function PersonalizedTargets({
  rules,
  records,
  logs = [],
}: {
  rules: Prescription[];
  records: AthleteRecord[];
  logs?: ExerciseLog[];
}) {
  if (!rules.length) return null;
  return (
    <section className="mt-4 space-y-3 rounded-lg border border-orange-800/50 bg-orange-950/10 p-4">
      <h3 className="font-medium text-orange-400">Your Suggested Targets</h3>
      {rules.map((r) => {
        const target = suggestion(r, records, logs);
        return (
          <div key={r.id}>
            <p>
              {r.label} · {r.sets} × {r.reps} · <strong>{target.text}</strong>
            </p>
            <p className="text-xs text-zinc-400">
              {target.basis}
              {RECORDS[r.record_key].kind === "time"
                ? " · Same distance as the reference record"
                : ""}
            </p>
            <details className="mt-2 text-sm text-zinc-300">
              <summary className="cursor-pointer text-orange-300">
                How this target and progression work
              </summary>
              <ul className="mt-2 list-disc space-y-2 pl-5">
                {loadingGuidance(r).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          </div>
        );
      })}
      <p className="text-xs text-zinc-400">
        Adjust for today’s ability and available equipment. Log what you
        actually performed.
      </p>
    </section>
  );
}
