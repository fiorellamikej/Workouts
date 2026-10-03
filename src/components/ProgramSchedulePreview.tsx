'use client'

import { useState } from 'react'
import type { PlanSession } from '@/types/database'

export function ProgramSchedulePreview({
  sessions,
}: {
  sessions: PlanSession[]
}) {
  const [open, setOpen] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const weeks = [...new Set(sessions.map((s) => s.week_number))].sort(
    (a, b) => a - b,
  )
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="program-schedule"
        onClick={() => setOpen(!open)}
        className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-xl font-semibold"
      >
        Preview workout schedule{' '}
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div id="program-schedule" className="mt-5 space-y-5">
          {weeks.map((week) => (
            <section key={week} className="space-y-3">
              <h2 className="text-lg font-semibold">Week {week}</h2>
              {sessions
                .filter((s) => s.week_number === week)
                .map((s) => (
                  <div
                    key={s.id}
                    className="rounded-lg border border-zinc-700 p-3"
                  >
                    <button
                      type="button"
                      aria-expanded={selectedDay === s.id}
                      aria-controls={`preview-${s.id}`}
                      onClick={() =>
                        setSelectedDay(selectedDay === s.id ? null : s.id)
                      }
                      className="flex min-h-12 w-full items-center justify-between gap-3 text-left font-medium"
                    >
                      <span>
                        Day {s.day_number}: {s.title}
                      </span>
                      <span aria-hidden="true">
                        {selectedDay === s.id ? '−' : '+'}
                      </span>
                    </button>
                    {selectedDay === s.id && (
                      <div id={`preview-${s.id}`}>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">
                          {s.description || 'No workout description added.'}
                        </p>
                        {s.notes && (
                          <details className="mt-3 text-xs text-zinc-400">
                            <summary className="cursor-pointer">
                              Workout notes
                            </summary>
                            <p className="mt-2 whitespace-pre-wrap">
                              {s.notes}
                            </p>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
