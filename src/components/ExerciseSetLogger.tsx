"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  exerciseKey,
  type ExerciseEntry,
  type PreviousExercise,
} from "@/lib/exercise-logging";
import { timeText } from "@/lib/training";
export function ExerciseSetLogger({
  entries,
  onChange,
  excludeResultId,
  disabled = false,
}: {
  entries: ExerciseEntry[];
  onChange: (entries: ExerciseEntry[]) => void;
  excludeResultId?: string;
  disabled?: boolean;
}) {
  const [previous, setPrevious] = useState<PreviousExercise[]>([]);
  const [historyError, setHistoryError] = useState("");
  const names = JSON.stringify(
    entries.map((e) => e.label.trim()).filter(Boolean),
  );
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await createClient().rpc(
        "previous_exercise_performance",
        { p_labels: JSON.parse(names), p_exclude: excludeResultId || null },
      );
      if (!cancelled) {
        setPrevious(data || []);
        setHistoryError(
          error
            ? "Previous results could not load. Your current entries are still editable."
            : "",
        );
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [names, excludeResultId]);
  const field =
    "w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm";
  function patch(i: number, value: Partial<ExerciseEntry>) {
    onChange(entries.map((e, n) => (n === i ? { ...e, ...value } : e)));
  }
  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-semibold">Exercise log</h3>
        <p className="text-xs text-zinc-400">
          Use one card per exercise. Add each additional set with + Add set
          inside that card, including ramped loads. Blank values stay blank. Use
          the same exercise name to find previous performance. These entries do
          not change personalized progression; use its actual-load field below.
        </p>
      </div>
      {historyError && (
        <p role="status" className="text-xs text-amber-400">
          {historyError}
        </p>
      )}
      {entries.map((e, i) => {
        const last = previous.find((p) => p.label_key === exerciseKey(e.label));
        return (
          <fieldset
            disabled={disabled}
            key={e.id}
            className="space-y-3 rounded-xl border border-zinc-700 p-3"
          >
            <div className="flex gap-2">
              <label className="flex-1 text-xs">
                Exercise
                <input
                  aria-label={`Exercise ${i + 1} name`}
                  className={field}
                  value={e.label}
                  maxLength={100}
                  onChange={(v) => patch(i, { label: v.target.value })}
                />
              </label>
              <label className="text-xs">
                Unit
                <select
                  className={field}
                  value={e.unit}
                  onChange={(v) =>
                    patch(i, { unit: v.target.value as "lb" | "kg" })
                  }
                >
                  <option value="lb">lb</option>
                  <option value="kg">kg</option>
                </select>
              </label>
              <button
                type="button"
                aria-label={`Remove ${e.label || "exercise"}`}
                className="text-sm text-red-400"
                onClick={() => onChange(entries.filter((_, n) => n !== i))}
              >
                Remove
              </button>
            </div>
            {last ? (
              <div className="rounded-lg bg-orange-950/30 p-2 text-xs text-orange-200">
                <p>
                  Last time · {new Date(last.completed_at).toLocaleDateString()}{" "}
                  · {last.source}
                </p>
                {last.entry.sets.map((s, n) => (
                  <span className="mr-3 inline-block" key={n}>
                    Set {n + 1}: {s.reps ?? "N/A"} reps ·{" "}
                    {s.weight == null ? "N/A" : `${s.weight} ${last.entry.unit}`}{" "}
                    {s.rpe != null ? `· RPE ${s.rpe}` : ""}
                    {s.completed ? " ✓" : ""}
                  </span>
                ))}
                {last.entry.notes && <p>{last.entry.notes}</p>}
                {last.entry.duration_seconds && (
                  <p>{timeText(last.entry.duration_seconds)}</p>
                )}
                {last.entry.distance && (
                  <p>
                    {last.entry.distance} {last.entry.distance_unit}
                  </p>
                )}
              </div>
            ) : (
              e.label && (
                <p className="text-xs text-zinc-500">
                  No previous set log for this exercise yet.
                </p>
              )
            )}
            {e.sets.map((s, n) => (
              <div
                key={n}
                className="grid grid-cols-[1.5rem_1fr_1fr_1fr_2rem] items-end gap-2"
              >
                <span className="pb-2 text-xs text-zinc-400">{n + 1}</span>
                {(["reps", "weight", "rpe"] as const).map((k) => (
                  <label key={k} className="text-xs">
                    {k === "weight" ? e.unit : k === "rpe" ? "RPE" : "Reps"}
                    <input
                      aria-label={`${e.label} set ${n + 1} ${k}`}
                      type="number"
                      className={field}
                      min={k === "rpe" ? 1 : 0}
                      max={k === "rpe" ? 10 : k === "reps" ? 10000 : 999999}
                      step={k === "reps" ? 1 : "any"}
                      value={s[k] ?? ""}
                      onChange={(v) =>
                        patch(i, {
                          sets: e.sets.map((t, j) =>
                            j === n
                              ? {
                                  ...t,
                                  [k]:
                                    v.target.value === ""
                                      ? null
                                      : Number(v.target.value),
                                }
                              : t,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
                <label className="pb-2 text-center text-xs">
                  Done
                  <input
                    aria-label={`${e.label} set ${n + 1} completed`}
                    type="checkbox"
                    className="mt-2 block h-5 w-5"
                    checked={s.completed}
                    onChange={(v) =>
                      patch(i, {
                        sets: e.sets.map((t, j) =>
                          j === n ? { ...t, completed: v.target.checked } : t,
                        ),
                      })
                    }
                  />
                </label>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-orange-500/70 bg-orange-500/15 px-5 py-3 text-sm font-semibold text-orange-300 hover:bg-orange-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400 disabled:opacity-40"
                disabled={e.sets.length >= 50}
                onClick={() =>
                  patch(i, {
                    sets: [
                      ...e.sets,
                      { reps: null, weight: null, rpe: null, completed: false },
                    ],
                  })
                }
              >
                + Add set
              </button>
              {e.sets.length > 1 && (
                <button
                  type="button"
                  className="min-h-11 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:text-white"
                  onClick={() => patch(i, { sets: e.sets.slice(0, -1) })}
                >
                  Remove last set
                </button>
              )}
            </div>
            <details>
              <summary className="cursor-pointer text-xs text-zinc-400">
                Time, distance, and exercise notes
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-xs">
                  Time (seconds)
                  <input
                    className={field}
                    type="number"
                    min={1}
                    step={1}
                    value={e.duration_seconds ?? ""}
                    onChange={(v) =>
                      patch(i, {
                        duration_seconds: v.target.value
                          ? Number(v.target.value)
                          : null,
                      })
                    }
                  />
                </label>
                <label className="text-xs">
                  Distance
                  <input
                    className={field}
                    type="number"
                    min={0}
                    step="any"
                    value={e.distance ?? ""}
                    onChange={(v) =>
                      patch(i, {
                        distance: v.target.value
                          ? Number(v.target.value)
                          : null,
                      })
                    }
                  />
                </label>
                <select
                  aria-label={`${e.label} distance unit`}
                  className={field}
                  value={e.distance_unit || "m"}
                  onChange={(v) =>
                    patch(i, {
                      distance_unit: v.target.value as "m" | "km" | "mi",
                    })
                  }
                >
                  <option value="m">Meters</option>
                  <option value="km">Kilometers</option>
                  <option value="mi">Miles</option>
                </select>
                <input
                  aria-label={`${e.label} notes`}
                  className={field}
                  placeholder="Exercise notes"
                  maxLength={1000}
                  value={e.notes || ""}
                  onChange={(v) => patch(i, { notes: v.target.value })}
                />
              </div>
            </details>
          </fieldset>
        );
      })}
      <button
        type="button"
        disabled={disabled || entries.length >= 100}
        className="min-h-11 rounded-lg bg-zinc-800 px-4 py-3 text-sm font-medium disabled:opacity-40"
        onClick={() =>
          onChange([
            ...entries,
            {
              id: crypto.randomUUID(),
              label: "",
              unit: "lb",
              sets: [{ reps: null, weight: null, rpe: null, completed: false }],
            },
          ])
        }
      >
        + Add different exercise
      </button>
    </section>
  );
}
