"use client";

import { useState } from "react";
import { ExerciseSetLogger } from "./ExerciseSetLogger";
import {
  entriesForSave,
  validateEntries,
  type ExerciseEntry,
} from "@/lib/exercise-logging";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { formatTime, parseTimeInput } from "@/lib/utils";

type Props = {
  workoutId: string;
  workoutType: string;
  existing?: {
    id: string;
    completion_time_seconds: number | null;
    rounds: number | null;
    extra_reps: number | null;
    weight_used: string | null;
    is_rx: boolean;
    exercise_entries?: ExerciseEntry[];
    notes: string | null;
  } | null;
};

export function LogResultForm({ workoutId, workoutType, existing }: Props) {
  const [entries, setEntries] = useState<ExerciseEntry[]>(
    existing?.exercise_entries || [],
  );
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [timeInput, setTimeInput] = useState(
    existing?.completion_time_seconds
      ? formatTime(existing.completion_time_seconds)
      : "",
  );
  const [rounds, setRounds] = useState(existing?.rounds?.toString() || "");
  const [extraReps, setExtraReps] = useState(
    existing?.extra_reps?.toString() || "",
  );
  const [weightUsed, setWeightUsed] = useState(existing?.weight_used || "");
  const [isRx, setIsRx] = useState(existing?.is_rx ?? true);
  const [notes, setNotes] = useState(existing?.notes || "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const savedEntries = entriesForSave(entries);
    const invalid = validateEntries(savedEntries);
    if (invalid) {
      setError(invalid);
      return;
    }
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be logged in");
      setLoading(false);
      return;
    }

    const payload = {
      user_id: user.id,
      workout_id: workoutId,
      completion_time_seconds:
        workoutType === "amrap" ? null : parseTimeInput(timeInput),
      rounds: workoutType === "amrap" ? parseInt(rounds) || null : null,
      extra_reps: workoutType === "amrap" ? parseInt(extraReps) || null : null,
      weight_used: weightUsed || null,
      is_rx: isRx,
      notes: notes || null,
      exercise_entries: savedEntries,
    };

    const { error } = await supabase.rpc("save_wod_exercise_result", {
      p_workout: workoutId,
      p_result: payload,
      p_entries: savedEntries,
      p_result_id: existing?.id || null,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.refresh();
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {workoutType === "amrap" ? (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Rounds
            </label>
            <input
              type="number"
              value={rounds}
              onChange={(e) => setRounds(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
              placeholder="e.g. 8"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Extra Reps
            </label>
            <input
              type="number"
              value={extraReps}
              onChange={(e) => setExtraReps(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
              placeholder="e.g. 5"
            />
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Time (mm:ss)
          </label>
          <input
            type="text"
            value={timeInput}
            onChange={(e) => setTimeInput(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none font-mono"
            placeholder="12:34"
          />
        </div>
      )}

      <ExerciseSetLogger
        entries={entries}
        onChange={setEntries}
        excludeResultId={existing?.id}
        disabled={loading}
      />
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">
          Weight Used (optional)
        </label>
        <input
          type="text"
          value={weightUsed}
          onChange={(e) => setWeightUsed(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
          placeholder="e.g. 135 lb or 50/35 kg"
        />
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isRx}
            onChange={(e) => setIsRx(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-800 text-orange-500 focus:ring-orange-500"
          />
          <span className="text-sm text-zinc-300">Rx (as prescribed)</span>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
          placeholder="Any notes about the workout..."
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-orange-600 px-4 py-2.5 font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition"
      >
        {loading ? "Saving..." : existing ? "Update Result" : "Log Result"}
      </button>
    </form>
  );
}
