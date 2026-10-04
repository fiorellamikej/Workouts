"use client";
import { reportAppError } from "@/lib/report-error";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  RECORDS,
  bestRecord,
  trainingRecord,
  recordValue,
  timeText,
  parseDuration,
  type AthleteRecord,
  type RecordKey,
} from "@/lib/training";

export function PersonalRecords({ records }: { records: AthleteRecord[] }) {
  const [key, setKey] = useState<RecordKey>("squat");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<"lb" | "kg">("lb");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();
  const timed = RECORDS[key].kind === "time";
  const field =
    "w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-white";
  const renderValue = (r: AthleteRecord) =>
    r.unit === "seconds"
      ? timeText(Number(r.value))
      : `${Number(recordValue(r, unit).toFixed(2))} ${unit}`;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    const parsed = timed ? parseDuration(value) : Number(value);
    if (
      !parsed ||
      !Number.isFinite(parsed) ||
      parsed <= 0 ||
      parsed >= 1000000
    ) {
      setError(
        timed
          ? "Enter a positive time as mm:ss (example 7:30)."
          : "Enter a positive weight.",
      );
      return;
    }
    if (editingId && !date) {
      setError("Keep or choose the achieved date for this correction.");
      return;
    }
    setBusy(true);
    try {
      const db = createClient();
      const {
        data: { user },
      } = await db.auth.getUser();
      if (!user) throw new Error("Please log in again.");
      const payload = {
        record_key: key,
        value: parsed,
        unit: timed ? "seconds" : unit,
        ...(date ? { achieved_at: date } : {}),
        notes: notes.trim() || null,
      };
      const query = editingId
        ? db
            .from("athlete_records")
            .update(payload)
            .eq("id", editingId)
            .eq("user_id", user.id)
        : db.from("athlete_records").insert({ ...payload, user_id: user.id });
      const { error } = await query.select("id").single();
      if (error) throw error;
      setValue("");
      setNotes("");
      setMessage(editingId ? "Record corrected." : "Record saved.");
      setEditingId(null);
      setDate("");
      router.refresh();
    } catch (e) {
      void reportAppError(e);
      setError(e instanceof Error ? e.message : "Could not save record.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this record entry?")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error } = await createClient()
        .from("athlete_records")
        .delete()
        .eq("id", id);
      if (error) throw error;
      if (editingId === id) {
        setEditingId(null);
        setValue("");
        setDate("");
        setNotes("");
      }
      router.refresh();
    } catch (e) {
      void reportAppError(e);
      setError(e instanceof Error ? e.message : "Could not delete record.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <h2 className="text-xl font-semibold">Your Personal Records</h2>
      <p className="text-sm text-zinc-400">
        Enter actual one-rep maxes for lifts and finish times for runs. Your
        best result stays visible; workout targets use your most recent dated
        entry so you can record a lower current max when rebuilding.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(RECORDS) as RecordKey[]).map((k) => {
          const best = bestRecord(records, k),
            latest = trainingRecord(records, k);
          return (
            <div key={k} className="rounded-lg bg-zinc-800/60 p-3">
              <p className="text-sm text-zinc-400">{RECORDS[k].label}</p>
              <p className="text-xl font-semibold">
                {best ? renderValue(best) : "N/A"}
              </p>
              {latest && (
                <p className="text-xs text-zinc-400">
                  Current baseline: {renderValue(latest)} · {latest.achieved_at}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <form id="record-form" onSubmit={save} className="scroll-mt-24 space-y-3">
        {editingId && (
          <p className="text-orange-400">
            Editing an existing record  -  saving corrects this entry.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Record
            <select
              className={field}
              value={key}
              onChange={(e) => {
                setKey(e.target.value as RecordKey);
                setValue("");
              }}
            >
              {(Object.keys(RECORDS) as RecordKey[]).map((k) => (
                <option key={k} value={k}>
                  {RECORDS[k].label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {timed ? "Finish time (mm:ss)" : "One-rep max"}
            <input
              required
              className={field}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={timed ? "7:30" : "225"}
              inputMode={timed ? "text" : "decimal"}
            />
          </label>
          <label className="text-sm">
            Display / entry weight unit
            <select
              className={field}
              value={unit}
              onChange={(e) => setUnit(e.target.value as "lb" | "kg")}
            >
              <option value="lb">Pounds</option>
              <option value="kg">Kilograms</option>
            </select>
          </label>
          <label className="text-sm">
            {editingId ? "Date achieved" : "Date achieved (blank = today)"}
            <input
              className={field}
              type="date"
              required={!!editingId}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>
        <label className="block text-sm">
          Notes
          <input
            className={field}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            placeholder="Optional context"
          />
        </label>
        <button
          disabled={busy}
          className="rounded-lg bg-orange-600 px-4 py-2 disabled:opacity-50"
        >
          {busy ? "Saving…" : editingId ? "Save Correction" : "Save Record"}
        </button>
        {editingId && (
          <button
            type="button"
            disabled={busy}
            className="ml-3 text-sm text-zinc-300"
            onClick={() => {
              setEditingId(null);
              setValue("");
              setDate("");
              setNotes("");
              setError("");
            }}
          >
            Cancel Edit
          </button>
        )}
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
      <details>
        <summary className="cursor-pointer text-orange-400">
          Record history ({records.length})
        </summary>
        <ul className="mt-3 space-y-2">
          {records.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 border-b border-zinc-800 py-2"
            >
              <div>
                {RECORDS[r.record_key].label}: {renderValue(r)}
                <p className="text-xs text-zinc-400">
                  {r.achieved_at}
                  {r.notes ? ` · ${r.notes}` : ""}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  disabled={busy}
                  className="text-sm text-orange-400"
                  onClick={() => {
                    setEditingId(r.id);
                    setKey(r.record_key);
                    setValue(
                      r.unit === "seconds"
                        ? timeText(Number(r.value))
                        : String(r.value),
                    );
                    if (r.unit !== "seconds") setUnit(r.unit);
                    setDate(r.achieved_at);
                    setNotes(r.notes || "");
                    setError("");
                    setMessage("");
                    document
                      .getElementById("record-form")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  Edit
                </button>
                <button
                  disabled={busy}
                  onClick={() => remove(r.id)}
                  className="text-sm text-red-400"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
