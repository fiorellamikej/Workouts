"use client";
import type { ExerciseDefinition } from "@/lib/exercise-logging";
export function ExerciseDefinitionEditor({
  value,
  onChange,
}: {
  value: ExerciseDefinition[];
  onChange: (value: ExerciseDefinition[]) => void;
}) {
  const field =
    "w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm";
  return (
    <details className="rounded-lg border border-zinc-700 p-3">
      <summary className="cursor-pointer text-sm text-orange-400">
        Exercise logging fields ({value.length})
      </summary>
      <p className="my-2 text-xs text-zinc-400">
        Add every exercise you want ready in the set logger. Keep ramping, RPE,
        and alternatives in the workout text. This does not generate automatic
        loads. Users can add exercises themselves.
      </p>
      {value.map((e, i) => (
        <div
          className="my-2 grid grid-cols-[1fr_4rem_4rem_auto] gap-2"
          key={e.id}
        >
          <label className="text-xs">
            Exercise
            <input
              className={field}
              maxLength={100}
              value={e.label}
              onChange={(v) =>
                onChange(
                  value.map((d, n) =>
                    n === i ? { ...d, label: v.target.value } : d,
                  ),
                )
              }
            />
          </label>
          <label className="text-xs">
            Sets
            <input
              className={field}
              type="number"
              min={1}
              max={50}
              value={e.sets}
              onChange={(v) =>
                onChange(
                  value.map((d, n) =>
                    n === i ? { ...d, sets: Number(v.target.value) } : d,
                  ),
                )
              }
            />
          </label>
          <label className="text-xs">
            Reps
            <input
              className={field}
              type="number"
              min={0}
              max={10000}
              value={e.reps ?? ""}
              onChange={(v) =>
                onChange(
                  value.map((d, n) =>
                    n === i
                      ? {
                          ...d,
                          reps:
                            v.target.value === ""
                              ? null
                              : Number(v.target.value),
                        }
                      : d,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            className="text-xs text-red-400"
            onClick={() => onChange(value.filter((_, n) => n !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={value.length >= 100}
        className="text-sm text-orange-400"
        onClick={() =>
          onChange([
            ...value,
            { id: crypto.randomUUID(), label: "", sets: 3, reps: null },
          ])
        }
      >
        + Exercise
      </button>
    </details>
  );
}
