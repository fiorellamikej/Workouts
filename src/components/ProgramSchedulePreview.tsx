"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { PlanSession } from "@/types/database";

export function ProgramSchedulePreview({ sessions, initialWeek, openByDefault = false, planId, attempt, selectedId, completedIds = [] }: {
  sessions: PlanSession[];
  initialWeek?: number;
  openByDefault?: boolean;
  planId?: string;
  attempt?: number;
  selectedId?: string;
  completedIds?: string[];
}) {
  const [open, setOpen] = useState(openByDefault);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const weeks = [...new Set(sessions.map((session) => session.week_number))].sort((a, b) => a - b);
  const [week, setWeek] = useState(initialWeek && weeks.includes(initialWeek) ? initialWeek : weeks[0]);
  const index = weeks.indexOf(week);
  const id = useId();
  function move(nextIndex: number) {
    const next = weeks[nextIndex];
    if (next == null) return;
    setWeek(next);
    setSelectedDay(null);
  }
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <button type="button" aria-expanded={open} aria-controls={`${id}-schedule`} onClick={() => setOpen(!open)} className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-xl font-semibold">
        {planId ? "Browse program weeks" : "Preview workout schedule"}<span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && <div id={`${id}-schedule`} className="mt-5 space-y-4">
        {!weeks.length ? <p className="text-zinc-400">No sessions added yet.</p> : <>
          <div className="flex items-center justify-between gap-2" aria-label="Program week navigation">
            <button type="button" disabled={index <= 0} onClick={() => move(index - 1)} aria-label="Previous week" className="min-h-12 rounded-lg border border-zinc-700 px-3 py-2 disabled:opacity-40">← <span className="hidden sm:inline">Previous week</span></button>
            <h2 aria-live="polite" className="text-center font-semibold">Week {week}<span className="block text-xs font-normal text-zinc-400">{index + 1} of {weeks.length}</span></h2>
            <button type="button" disabled={index >= weeks.length - 1} onClick={() => move(index + 1)} aria-label="Next week" className="min-h-12 rounded-lg border border-zinc-700 px-3 py-2 disabled:opacity-40"><span className="hidden sm:inline">Next week </span>→</button>
          </div>
          {planId && <p className="text-xs text-zinc-400">Browsing weeks does not change your saved progress. Open a workout below to view or log it.</p>}
          {sessions.filter((session) => session.week_number === week).map((session) => <div key={session.id} className={`rounded-lg border p-3 ${selectedId === session.id ? "border-orange-600" : "border-zinc-700"}`}>
            <button type="button" aria-expanded={selectedDay === session.id} aria-controls={`${id}-${session.id}`} onClick={() => setSelectedDay(selectedDay === session.id ? null : session.id)} className="flex min-h-12 w-full items-center justify-between gap-3 text-left font-medium">
              <span>Day {session.day_number}: {session.title}{completedIds.includes(session.id) ? " · Completed" : ""}</span><span aria-hidden="true">{selectedDay === session.id ? "−" : "+"}</span>
            </button>
            {selectedDay === session.id && <div id={`${id}-${session.id}`} className="space-y-3">
              <p className="whitespace-pre-wrap text-sm text-zinc-300">{session.description || "No workout description added."}</p>
              {session.notes && <details className="text-xs text-zinc-400"><summary className="min-h-11 cursor-pointer py-3">Workout notes</summary><p className="whitespace-pre-wrap">{session.notes}</p></details>}
              {planId && <Link href={`/plans/${planId}?run=${attempt || 1}&day=${session.id}#session-${session.id}`} className="inline-block min-h-11 rounded-lg bg-orange-600 px-4 py-3 text-sm">{completedIds.includes(session.id) ? "View saved workout" : "Open workout"} →</Link>}
            </div>}
          </div>)}
        </>}
      </div>}
    </section>
  );
}
