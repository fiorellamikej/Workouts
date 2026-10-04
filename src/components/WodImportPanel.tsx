"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RECORDS } from "@/lib/training";
import { PHASES, wodToday, type PhaseKey } from "@/lib/daily-wod";
import { normalizeWodImport, parseWodImport, rebaseWodImport, type WodImport, type ImportedWod } from "@/lib/wod-import";

type ReviewRow = { workout_date: string; title: string; state: "new" | "unchanged" | "conflict" };
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,val]) => `${JSON.stringify(key)}:${stable(val)}`).join(",")}}`;
  return JSON.stringify(value);
}
function same(a: ImportedWod & { phase_id: string | null }, b: ImportedWod, phaseId: string | null) {
  return a.phase_id === phaseId && !!phaseId && a.title === b.title && a.description === b.description && a.workout_type === b.workout_type && a.time_cap_seconds === b.time_cap_seconds && a.notes === b.notes && stable(a.prescriptions) === stable(b.prescriptions);
}
export function WodImportPanel() {
  const router = useRouter();
  const [client] = useState(() => createClient());
  const [phaseKey, setPhaseKey] = useState<PhaseKey>("base");
  const [loaded, setLoaded] = useState<WodImport | null>(null);
  const [startDate, setStartDate] = useState("");
  const [review, setReview] = useState<ReviewRow[] | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const prepared = useMemo(() => {
    if (!loaded) return null;
    try { return rebaseWodImport({ ...loaded, phase: { ...loaded.phase, key: phaseKey } }, startDate); } catch { return null; }
  }, [loaded, startDate, phaseKey]);
  const clearReview = () => { setReview(null); setAcknowledged(false); setError(null); setMessage(null); };
  async function load(file: File | undefined) {
    clearReview(); setLoaded(null);
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Maximum file size is 5 MB.");
      const value = parseWodImport(await file.text(), phaseKey);
      setLoaded(value); setStartDate(value.phase.start_date); setPhaseKey(value.phase.key);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read this file."); }
    finally { setBusy(false); }
  }
  async function inspect() {
    if (!prepared || busy) return;
    clearReview(); setBusy(true);
    try {
      const phases = await client.from("daily_wod_phases").select("id,phase_key,start_date,end_date").lte("start_date", prepared.phase.end_date).gte("end_date", prepared.phase.start_date);
      if (phases.error) throw new Error("Could not load phase dates. Apply the Daily WOD phases migration and retry.");
      const exact = phases.data?.find((p) => p.phase_key === prepared.phase.key && p.start_date === prepared.phase.start_date && p.end_date === prepared.phase.end_date);
      if (phases.data?.some((p) => p.id !== exact?.id)) throw new Error("These dates overlap another phase. Choose a start date outside its range.");
      const existing = await client.from("workouts").select("workout_date,title,description,workout_type,time_cap_seconds,notes,prescriptions,phase_id").gte("workout_date", prepared.phase.start_date).lte("workout_date", prepared.phase.end_date).returns<(ImportedWod & { phase_id: string | null })[]>();
      if (existing.error) throw new Error("Could not check existing WODs. Reload and retry.");
      const byDate = new Map((existing.data || []).map((w) => [w.workout_date, w]));
      setReview(prepared.workouts.map((w): ReviewRow => { const previous = byDate.get(w.workout_date); return { workout_date: w.workout_date, title: previous?.title || w.title, state: !previous ? "new" : same(previous, w, exact?.id || null) ? "unchanged" : "conflict" }; }));
    } catch (e) { setError(e instanceof Error ? e.message : "Review failed."); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!prepared || !review || !acknowledged || busy || review.some((r) => r.state === "conflict")) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      // Revalidate immediately before submitting; the database repeats validation and conflict checks.
      const payload = normalizeWodImport({ schema_version: 1, phase: prepared.phase, workouts: prepared.workouts });
      const result = await client.rpc("import_daily_wod_phase", { p_phase: payload.phase, p_workouts: payload.workouts });
      if (result.error) throw result.error;
      const counts = result.data as { inserted: number; unchanged: number };
      setMessage(`Phase saved: ${counts.inserted} new WODs, ${counts.unchanged} unchanged. They become available on their assigned dates at midnight Eastern Time.`);
      setReview(null); setAcknowledged(false); router.refresh();
    } catch (e) { setReview(null); setAcknowledged(false); setError(e && typeof e === "object" && "message" in e ? String(e.message) : "Import failed. Review existing dates before retrying."); }
    finally { setBusy(false); }
  }
  return (
    <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 sm:p-6" aria-labelledby="wod-import-heading">
      <h3 id="wod-import-heading" className="text-xl font-semibold">Schedule a Daily WOD phase</h3>
      <p className="text-sm text-zinc-300">Upload one complete phase JSON, review every day, then save the schedule. Eight-week phases contain 56 consecutive dates, including rest days. Deload contains 7–14 dates. Future WODs are available to admins for review; athletes see them on their assigned dates.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm"><span className="block">Phase</span><select value={phaseKey} disabled={busy} onChange={(e) => { setPhaseKey(e.target.value as PhaseKey); clearReview(); }} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 p-2">{Object.entries(PHASES).map(([key,p]) => <option key={key} value={key}>{p.label}</option>)}</select></label>
        <label className="space-y-1 text-sm"><span className="block">Daily WOD JSON file</span><input type="file" accept=".json,application/json" disabled={busy} onChange={(e) => void load(e.target.files?.[0])} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-700 file:px-3 file:py-2" /></label>
      </div>
      {loaded && <>
        <label className="block max-w-xs space-y-1 text-sm"><span className="block">First calendar day (change to shift the entire phase)</span><input type="date" value={startDate} disabled={busy} onChange={(e) => { setStartDate(e.target.value); clearReview(); }} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 p-2" /></label>
        {!prepared ? <p role="alert" className="text-red-400">Select a valid start date and a phase with the correct number of days.</p> : <>
          <p className="text-zinc-200">{PHASES[prepared.phase.key].label}: {prepared.workouts.length} days, {prepared.phase.start_date} through {prepared.phase.end_date}. Includes {prepared.workouts.filter((w) => w.workout_type === "rest").length} rest days.</p>
          {prepared.phase.start_date > wodToday() && <p className="text-sm text-yellow-300">This schedule starts in the future. Today will keep its existing WOD until the phase begins.</p>}
          {prepared.warnings.length > 0 && <details className="rounded-lg border border-yellow-800 p-3"><summary className="cursor-pointer font-medium text-yellow-300">Review {prepared.warnings.length} target/reference notes</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-300">{prepared.warnings.map((note) => <li key={note}>{note}</li>)}</ul></details>}
          <details><summary className="cursor-pointer text-orange-400">Review complete workout instructions and targets</summary><div className="mt-4 space-y-3">{prepared.workouts.map((w,i) => <details key={w.workout_date} className="rounded-lg border border-zinc-700 p-3"><summary className="cursor-pointer font-medium">Day {i + 1}: {w.workout_date} | {w.title} ({w.workout_type})</summary><p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{w.description}</p>{w.notes && <p className="mt-3 text-sm text-zinc-400">Notes: {w.notes}</p>}{w.prescriptions.map((p) => <p key={p.id} className="mt-2 text-sm text-orange-300">{p.label}: {p.sets} sets of {p.reps}, {p.percent}% of {RECORDS[p.record_key].label}; {p.unit}, rounded down to {p.rounding}.</p>)}</details>)}</div></details>
          <button type="button" disabled={busy} onClick={inspect} className="rounded-lg border border-orange-700 px-4 py-2 text-orange-400 disabled:opacity-50">{busy ? "Working..." : "Check dates and existing WODs"}</button>
        </>}
      </>}
      {review && <div className="space-y-3">
        <p>{review.filter((r) => r.state === "new").length} new, {review.filter((r) => r.state === "unchanged").length} unchanged, {review.filter((r) => r.state === "conflict").length} conflicting dates.</p>
        {review.some((r) => r.state === "conflict") && <div role="alert" className="text-sm text-red-300"><p>Different WODs already exist on these dates. Nothing will be overwritten. Review those WODs in Admin or shift the phase, then check dates again.</p><ul className="mt-2 list-disc pl-5">{review.filter((r) => r.state === "conflict").map((r) => <li key={r.workout_date}>{r.workout_date}: {r.title}</li>)}</ul></div>}
        <label className="flex items-start gap-3 text-sm text-zinc-300"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-1 h-5 w-5" />I reviewed the phase dates, workout instructions, and personalized target references.</label>
        <button type="button" onClick={save} disabled={busy || !acknowledged || review.some((r) => r.state === "conflict")} className="rounded-lg bg-orange-600 px-5 py-3 font-medium disabled:opacity-50">{busy ? "Saving..." : "Save phase schedule"}</button>
      </div>}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {message && <p role="status" className="text-sm text-green-400">{message}</p>}
    </section>
  );
}
