"use client";
import { ExerciseDefinitionEditor } from "./ExerciseDefinitionEditor";
import {
  validateDefinitions,
  type ExerciseDefinition,
} from "@/lib/exercise-logging";
import { PrescriptionEditor } from "@/components/PrescriptionEditor";
import { validatePrescriptions, type Prescription } from "@/lib/training";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Plan = {
  id: string;
  title: string;
  description: string | null;
  goal: string | null;
  duration_weeks: number;
  difficulty: string;
  equipment_required?: string[];
  equipment_suggested?: string[];
  fitness_guidance?: string | null;
  tags: string[] | null;
  is_published: boolean;
} | null;

type Session = {
  exercises?: ExerciseDefinition[];
  prescriptions: Prescription[];
  id: string;
  week_number: number;
  day_number: number;
  title: string;
  description: string | null;
  session_type: string;
  estimated_minutes: number | null;
  notes: string | null;
  order_index: number;
};

export function AdminPlanManager({
  existingPlan,
  existingSessions,
}: {
  existingPlan: Plan;
  existingSessions: Session[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Plan fields
  const [title, setTitle] = useState(existingPlan?.title || "");
  const [description, setDescription] = useState(
    existingPlan?.description || "",
  );
  const [goal, setGoal] = useState(existingPlan?.goal || "");
  const [durationWeeks, setDurationWeeks] = useState(
    existingPlan?.duration_weeks?.toString() || "4",
  );
  const [difficulty, setDifficulty] = useState(
    existingPlan?.difficulty || "intermediate",
  );
  const [tags, setTags] = useState(existingPlan?.tags?.join(", ") || "");
  const [isPublished, setIsPublished] = useState(
    existingPlan?.is_published ?? true,
  );

  const [requiredEquipment, setRequiredEquipment] = useState(
    existingPlan?.equipment_required?.join("\n") || "",
  );
  const [suggestedEquipment, setSuggestedEquipment] = useState(
    existingPlan?.equipment_suggested?.join("\n") || "",
  );
  const [fitnessGuidance, setFitnessGuidance] = useState(
    existingPlan?.fitness_guidance || "",
  );

  // Sessions
  const [sessions, setSessions] = useState<
    {
      exercises: ExerciseDefinition[];
      prescriptions: Prescription[];
      id?: string;
      week_number: number;
      day_number: number;
      title: string;
      description: string;
      session_type: string;
      estimated_minutes: string;
      notes: string;
      order_index: number;
    }[]
  >(
    existingSessions.map((s, i) => ({
      exercises: s.exercises || [],
      prescriptions: s.prescriptions || [],
      id: s.id,
      week_number: s.week_number,
      day_number: s.day_number,
      title: s.title,
      description: s.description || "",
      session_type: s.session_type,
      estimated_minutes: s.estimated_minutes?.toString() || "",
      notes: s.notes || "",
      order_index: s.order_index ?? i,
    })),
  );

  const addSession = () => {
    const last = sessions[sessions.length - 1];
    const nextWeek = last ? last.week_number : 1;
    const nextDay = last ? last.day_number + 1 : 1;
    setSessions([
      ...sessions,
      {
        week_number: nextDay > 7 ? nextWeek + 1 : nextWeek,
        day_number: nextDay > 7 ? 1 : nextDay,
        exercises: [],
        prescriptions: [],
        title: "",
        description: "",
        session_type: "workout",
        estimated_minutes: "",
        notes: "",
        order_index: sessions.length,
      },
    ]);
  };

  const updateSession = (
    index: number,
    field: string,
    value: string | number | Prescription[] | ExerciseDefinition[],
  ) => {
    const updated = [...sessions];
    updated[index] = { ...updated[index], [field]: value };
    setSessions(updated);
  };

  const removeSession = (index: number) => {
    setSessions(sessions.filter((_, i) => i !== index));
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const equipmentList = (value: string) => [
      ...new Set(
        value
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
    const requiredList = equipmentList(requiredEquipment);
    const suggestedList = equipmentList(suggestedEquipment);
    if (
      [requiredList, suggestedList].some(
        (items) => items.length > 30 || items.some((item) => item.length > 100),
      ) ||
      fitnessGuidance.length > 2000
    ) {
      setError(
        "Equipment lists allow 30 entries of up to 100 characters each. Fitness guidance allows 2000 characters.",
      );
      setLoading(false);
      return;
    }
    const planPayload = {
      title,
      description: description || null,
      goal: goal || null,
      duration_weeks: parseInt(durationWeeks) || 4,
      difficulty,
      equipment_required: requiredList,
      equipment_suggested: suggestedList,
      fitness_guidance: fitnessGuidance.trim() || null,
      tags: tagList.length ? tagList : null,
      is_published: isPublished,
      created_by: user.id,
    };

    for (const session of sessions) {
      try {
        validateDefinitions(session.exercises);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Invalid exercises");
        setLoading(false);
        return;
      }
      const invalid = validatePrescriptions(session.prescriptions);
      if (invalid) {
        setError(invalid);
        setLoading(false);
        return;
      }
    }
    const sessionRows = sessions.map((s, i) => ({
      id: s.id || null,
      week_number: s.week_number,
      day_number: s.day_number,
      title: s.title || `Session ${i + 1}`,
      description: s.description || null,
      session_type: s.session_type,
      estimated_minutes: s.estimated_minutes
        ? parseInt(s.estimated_minutes)
        : null,
      notes: s.notes || null,
      order_index: i,
      exercises: s.exercises,
      prescriptions: s.prescriptions,
    }));
    const { data: planId, error: saveError } = await supabase.rpc(
      "save_training_program",
      {
        p_plan_id: existingPlan?.id || null,
        p_plan: { ...planPayload, tags: tagList },
        p_sessions: sessionRows,
      },
    );
    if (saveError) {
      setError(saveError.message);
      setLoading(false);
      return;
    }

    setMessage(existingPlan ? "Plan updated!" : "Plan created!");
    setLoading(false);
    router.push(`/admin/plans?edit=${planId}`);
    router.refresh();
  };

  return (
    <form onSubmit={handleSavePlan} className="space-y-8">
      {/* Plan details */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Plan Details</h2>
        {existingPlan && (
          <Link
            href={`/plans/${existingPlan.id}/overview`}
            className="inline-block text-sm text-orange-400"
          >
            Preview program overview →
          </Link>
        )}

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
            placeholder="e.g. ACFT Improvement Program"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Program intention / goal
          </label>
          <input
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
            placeholder="e.g. Raise your ACFT score in 6 weeks"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
            placeholder="What this plan is about, who it's for, expected outcomes..."
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Duration (weeks)
            </label>
            <input
              type="number"
              value={durationWeeks}
              onChange={(e) => setDurationWeeks(e.target.value)}
              min={1}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Suggested fitness level
            </label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Tags (comma sep.)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
              placeholder="strength, military, running"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-zinc-300">
            Required equipment (one item per line)
            <textarea
              value={requiredEquipment}
              onChange={(e) => setRequiredEquipment(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2"
              placeholder={
                "Squat rack with safeties\nBarbell and plates\nFlat bench"
              }
            />
          </label>
          <label className="block text-sm text-zinc-300">
            Suggested equipment (one item per line)
            <textarea
              value={suggestedEquipment}
              onChange={(e) => setSuggestedEquipment(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2"
              placeholder={"Microplates\nLifting belt"}
            />
          </label>
        </div>
        <p className="text-xs text-zinc-400">
          List alternatives together, for example “Bike, rower, or treadmill.”
          Blank lists show “Not specified” on the overview. Enter “None —
          bodyweight only” when no equipment is needed.
        </p>
        <label className="block text-sm text-zinc-300">
          Fitness level / experience guidance
          <textarea
            value={fitnessGuidance}
            onChange={(e) => setFitnessGuidance(e.target.value)}
            rows={3}
            maxLength={2000}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2"
            placeholder="Who is this suitable for? Describe expected training experience or prerequisites."
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-800 text-orange-500"
          />
          Published (visible to users)
        </label>
      </div>

      {/* Sessions */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Sessions ({sessions.length})
          </h2>
          <button
            type="button"
            onClick={addSession}
            className="rounded-lg bg-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-600 transition"
          >
            + Add Session
          </button>
        </div>

        {sessions.length === 0 && (
          <p className="text-sm text-zinc-500">
            No sessions yet. Add the daily/weekly workouts for this plan.
          </p>
        )}

        <div className="space-y-4">
          {sessions.map((s, i) => (
            <div
              key={i}
              className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-zinc-500">
                  Session {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeSession(i)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Week
                  </label>
                  <input
                    type="number"
                    value={s.week_number}
                    onChange={(e) =>
                      updateSession(
                        i,
                        "week_number",
                        parseInt(e.target.value) || 1,
                      )
                    }
                    min={1}
                    className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Day
                  </label>
                  <input
                    type="number"
                    value={s.day_number}
                    onChange={(e) =>
                      updateSession(
                        i,
                        "day_number",
                        parseInt(e.target.value) || 1,
                      )
                    }
                    min={1}
                    max={7}
                    className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Type
                  </label>
                  <select
                    value={s.session_type}
                    onChange={(e) =>
                      updateSession(i, "session_type", e.target.value)
                    }
                    className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-sm text-white"
                  >
                    <option value="workout">Workout</option>
                    <option value="rest">Rest</option>
                    <option value="test">Test / Assessment</option>
                    <option value="recovery">Recovery</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Est. Minutes
                  </label>
                  <input
                    type="number"
                    value={s.estimated_minutes}
                    onChange={(e) =>
                      updateSession(i, "estimated_minutes", e.target.value)
                    }
                    className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-sm text-white"
                    placeholder="45"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={s.title}
                  onChange={(e) => updateSession(i, "title", e.target.value)}
                  className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-sm text-white"
                  placeholder="e.g. Strength Lower + Core"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Workout Content
                </label>
                <textarea
                  value={s.description}
                  onChange={(e) =>
                    updateSession(i, "description", e.target.value)
                  }
                  rows={4}
                  className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-sm text-white font-mono"
                  placeholder={`A. Back Squat 5x5\nB. Romanian DL 3x8\nC. 3 rounds:\n  - 15 KB Swings\n  - 10 Push-ups`}
                />
              </div>

              <ExerciseDefinitionEditor
                value={s.exercises}
                onChange={(v) => updateSession(i, "exercises", v)}
              />
              <PrescriptionEditor
                value={s.prescriptions}
                onChange={(value) => updateSession(i, "prescriptions", value)}
              />

              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={s.notes}
                  onChange={(e) => updateSession(i, "notes", e.target.value)}
                  className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-sm text-white"
                  placeholder="Scaling, equipment, tips..."
                />
              </div>
            </div>
          ))}
        </div>

        {sessions.length > 0 && (
          <button
            type="button"
            onClick={addSession}
            className="w-full rounded-lg border border-dashed border-zinc-600 py-3 text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition"
          >
            + Add another session
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {message && <p className="text-sm text-green-400">{message}</p>}

      <button
        type="submit"
        disabled={loading || !title}
        className="rounded-lg bg-orange-600 px-8 py-3 font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition"
      >
        {loading ? "Saving..." : existingPlan ? "Update Plan" : "Create Plan"}
      </button>
    </form>
  );
}
