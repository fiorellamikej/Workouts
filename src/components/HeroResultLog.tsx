"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { reportAppError } from "@/lib/report-error";
import {
  heroPayload,
  heroScore,
  type HeroWorkout,
  type HeroResult,
} from "@/lib/heroes";
import { timeText } from "@/lib/training";

export function HeroResultLog({
  workout,
  results,
  disabled,
  today,
  bestRx,
}: {
  workout: HeroWorkout;
  results: HeroResult[];
  disabled: boolean;
  today: string;
  bestRx?: HeroResult | null;
}) {
  const router = useRouter(),
    lock = useRef(false),
    requestId = useRef<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null),
    [date, setDate] = useState(today),
    [rx, setRx] = useState(false),
    [time, setTime] = useState(""),
    [rounds, setRounds] = useState(""),
    [extra, setExtra] = useState("0"),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const field =
    "mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2";
  const clear = () => {
    setEditing(null);
    requestId.current = null;
    setDate(today);
    setRx(false);
    setTime("");
    setRounds("");
    setExtra("0");
    setNotes("");
    setError("");
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current || disabled) return;
    setError("");
    setMessage("");
    let payload;
    try {
      payload = heroPayload(workout, date, rx, time, rounds, extra, notes);
      if (date > today)
        throw new Error("Choose today or an earlier workout date.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the score.");
      return;
    }
    lock.current = true;
    setBusy(true);
    requestId.current ??= crypto.randomUUID();
    try {
      const { data, error: saveError } = await createClient().rpc(
        "save_hero_result",
        {
          p_id: editing ?? requestId.current,
          p_workout: workout.slug,
          p_result: payload,
        },
      );
      if (saveError) throw saveError;
      if (!data)
        throw new Error(
          "No save confirmation returned. Refresh your history before retrying.",
        );
      setMessage(
        editing
          ? "Score corrected."
          : "Score saved. The form is clear for your next attempt.",
      );
      clear();
      router.replace(`/heroes/${workout.slug}`);
      router.refresh();
    } catch (e) {
      void reportAppError(e);
      setError(
        e &&
          typeof e === "object" &&
          "message" in e &&
          typeof e.message === "string"
          ? e.message
          : "Could not save. Retry uses the same attempt ID to avoid a duplicate.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const rxResults = results.filter((r) => r.is_rx);
  const best =
    bestRx === undefined
      ? [...rxResults].sort((a, b) =>
          workout.score_type === "for_time"
            ? a.completion_time_seconds! - b.completion_time_seconds!
            : b.rounds! * workout.round_reps! +
              b.extra_reps! -
              (a.rounds! * workout.round_reps! + a.extra_reps!),
        )[0]
      : bestRx;
  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border border-orange-800/60 bg-zinc-900/50 p-5">
        <h2 className="text-xl font-semibold">
          {editing ? "Correct your score" : "Log a completed attempt"}
        </h2>
        <p className="text-sm text-zinc-400">
          Your scores are private. Each new attempt adds to your history;
          correcting a score updates that attempt. Save only a completed workout
          or the full AMRAP clock.
        </p>
        <form onSubmit={save} className="space-y-4">
          <fieldset
            disabled={busy || disabled}
            className="space-y-4 disabled:opacity-60"
          >
            <label className="block">
              Workout date
              <input
                required
                type="date"
                max={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={field}
              />
            </label>
            {workout.score_type === "for_time" ? (
              <label className="block">
                Finish time (mm:ss)
                <input
                  required
                  inputMode="numeric"
                  placeholder="45:30"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className={field}
                />
              </label>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  Full rounds
                  <input
                    required
                    type="number"
                    min="0"
                    max="10000"
                    step="1"
                    value={rounds}
                    onChange={(e) => setRounds(e.target.value)}
                    className={field}
                  />
                </label>
                <label>
                  Extra reps after last full round
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    step="1"
                    value={extra}
                    onChange={(e) => setExtra(e.target.value)}
                    className={field}
                  />
                </label>
                <p className="text-sm text-zinc-400 sm:col-span-2">
                  The Rx round contains {workout.round_reps} reps. Record the
                  score at the end of the {workout.minutes}-minute clock.
                </p>
              </div>
            )}
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={rx}
                onChange={(e) => setRx(e.target.checked)}
                className="mt-1 h-5 w-5"
              />
              <span>
                Rx  -  completed the prescribed movements, volume and loading
                above.
              </span>
            </label>
            <label className="block">
              {rx
                ? "Notes / actual weights (optional)"
                : "Scaling / actual weights (required)"}
              <textarea
                required={!rx}
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={field}
                placeholder="Weights, substitutions, partitioning or other details"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                className="rounded bg-orange-600 px-5 py-3 font-semibold"
                type="submit"
              >
                {busy
                  ? "Saving…"
                  : editing
                    ? "Save correction"
                    : "Save new attempt"}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={clear}
                  className="rounded border border-zinc-700 px-4 py-3"
                >
                  Cancel correction
                </button>
              )}
            </div>
          </fieldset>
        </form>
        {error && (
          <p role="alert" className="text-red-400">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-green-400">
            {message}
          </p>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Your {workout.name} history</h2>
        {best && (
          <p className="rounded border border-orange-800 p-3">
            Best Rx: <strong>{heroScore(best)}</strong> · {best.performed_on}
          </p>
        )}
        <p className="text-sm text-zinc-400">
          Scaled attempts may use different movements or loads. Compare their
          notes before judging progress.
        </p>
        {!results.length && !disabled && (
          <p className="text-zinc-400">No attempts on this page.</p>
        )}
        {results.map((r) => (
          <article
            key={r.id}
            className="space-y-2 rounded border border-zinc-800 p-4"
          >
            <div className="flex flex-wrap justify-between gap-3">
              <p>
                <strong>{heroScore(r)}</strong> · {r.is_rx ? "Rx" : "Scaled"} ·{" "}
                {r.performed_on}
              </p>
              <button
                disabled={busy || disabled}
                type="button"
                className="text-orange-400 underline disabled:opacity-50"
                onClick={() => {
                  setEditing(r.id);
                  requestId.current = null;
                  setDate(r.performed_on);
                  setRx(r.is_rx);
                  setTime(
                    r.completion_time_seconds == null
                      ? ""
                      : timeText(r.completion_time_seconds),
                  );
                  setRounds(r.rounds == null ? "" : String(r.rounds));
                  setExtra(String(r.extra_reps ?? 0));
                  setNotes(r.notes);
                  setError("");
                  setMessage("");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Correct score
              </button>
            </div>
            {r.notes && (
              <p className="whitespace-pre-wrap text-sm text-zinc-300">
                {r.notes}
              </p>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
