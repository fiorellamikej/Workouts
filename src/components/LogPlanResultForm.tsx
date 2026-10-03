'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { PlanResult } from '@/types/database'
import {
  RECORDS,
  parseDuration,
  timeText,
  type ExerciseLog,
  type Prescription,
} from '@/lib/training'
export function LogPlanResultForm({
  enrollmentId,
  sessionId,
  rules = [],
  attempt,
  existing,
  existingLogs = [],
  planId,
}: {
  enrollmentId: string
  sessionId: string
  rules?: Prescription[]
  attempt: number
  existing?: PlanResult
  existingLogs?: ExerciseLog[]
  planId?: string
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [mode, setMode] = useState<'just_done' | 'time' | 'amrap'>('just_done')
  const [time, setTime] = useState(''),
    [rounds, setRounds] = useState(''),
    [extra, setExtra] = useState(''),
    [weight, setWeight] = useState(''),
    [notes, setNotes] = useState(''),
    [rx, setRx] = useState(false)
  const [logs, setLogs] = useState<
    Record<
      string,
      { value: string; outcome: 'comfortable' | 'hard' | 'missed' }
    >
  >({})
  const router = useRouter(),
    field = 'w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-sm'
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const seconds = mode === 'time' ? parseDuration(time) : null
    if (mode === 'time' && !seconds) {
      setError('Enter time as mm:ss, such as 12:30.')
      return
    }
    if (
      mode === 'amrap' &&
      (!/^\d+$/.test(rounds) || (extra !== '' && !/^\d+$/.test(extra)))
    ) {
      setError('Enter whole, nonnegative rounds and extra reps.')
      return
    }
    const exerciseLogs = []
    for (const r of rules) {
      const entry = logs[r.id]
      if (!entry?.value.trim()) continue
      const timed = RECORDS[r.record_key].kind === 'time'
      const parsed = timed ? parseDuration(entry.value) : Number(entry.value)
      if (!parsed || !Number.isFinite(parsed) || parsed <= 0) {
        setError(`Check the result for ${r.label}.`)
        return
      }
      exerciseLogs.push({
        prescription_id: r.id,
        value: parsed,
        unit: timed ? 'seconds' : r.unit,
        outcome: entry.outcome,
      })
    }
    setBusy(true)
    try {
      const { data: savedId, error } = await createClient().rpc(
        'save_training_session_result',
        {
          p_enrollment: enrollmentId,
          p_session: sessionId,
          p_attempt: attempt,
          p_result_id: existing?.id || null,
          p_result: {
            completion_time_seconds: seconds,
            rounds: mode === 'amrap' ? Number(rounds) : null,
            extra_reps: mode === 'amrap' ? Number(extra || 0) : null,
            weight_used: weight || null,
            is_rx: rx,
            notes: notes || null,
          },
          p_logs: exerciseLogs,
        },
      )
      if (error) throw error
      setOpen(false)
      if (!existing && planId && savedId)
        router.replace(
          `/plans/${planId}?day=${sessionId}&celebrate=${savedId}`,
          { scroll: true },
        )
      else router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save workout.')
    } finally {
      setBusy(false)
    }
  }
  if (!open)
    return (
      <button
        onClick={() => {
          setMode(
            existing?.completion_time_seconds != null
              ? 'time'
              : existing?.rounds != null
                ? 'amrap'
                : 'just_done',
          )
          setTime(
            existing?.completion_time_seconds != null
              ? timeText(existing.completion_time_seconds)
              : '',
          )
          setRounds(existing?.rounds != null ? String(existing.rounds) : '')
          setExtra(
            existing?.extra_reps != null ? String(existing.extra_reps) : '',
          )
          setWeight(existing?.weight_used || '')
          setNotes(existing?.notes || '')
          setRx(existing?.is_rx || false)
          setLogs(
            Object.fromEntries(
              existingLogs.map((l) => [
                l.prescription_id,
                {
                  value:
                    l.unit === 'seconds'
                      ? timeText(Number(l.value))
                      : String(l.value),
                  outcome: l.outcome,
                },
              ]),
            ),
          )
          setError('')
          setOpen(true)
        }}
        className="rounded-lg bg-orange-600 px-4 py-2 text-sm"
      >
        {existing ? 'Edit Result' : 'Complete Workout / Log Results'}
      </button>
    )
  return (
    <form onSubmit={save} className="space-y-3">
      <label className="block text-sm">
        Result type
        <select
          className={field}
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
        >
          <option value="just_done">Mark completed</option>
          <option value="time">Finish time</option>
          <option value="amrap">Rounds + reps</option>
        </select>
      </label>
      {mode === 'time' && (
        <label className="block text-sm">
          Finish time (mm:ss)
          <input
            required
            className={field}
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="12:30"
          />
        </label>
      )}
      {mode === 'amrap' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            Rounds
            <input
              required
              type="number"
              min={0}
              step={1}
              className={field}
              value={rounds}
              onChange={(e) => setRounds(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Extra reps
            <input
              type="number"
              min={0}
              step={1}
              className={field}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
            />
          </label>
        </div>
      )}
      {rules.length > 0 && (
        <p className="text-xs text-zinc-400">
          Optional exercise results drive the next suggested load. Enter the
          actual load used across your sets. Leaving a result blank records
          completion without changing progression.
        </p>
      )}
      {rules.map((r) => {
        const entry = logs[r.id] || { value: '', outcome: 'hard' as const },
          timed = RECORDS[r.record_key].kind === 'time'
        return (
          <div
            key={r.id}
            className="space-y-2 rounded-lg border border-zinc-700 p-3"
          >
            <label className="block text-sm">
              {r.label} · {r.sets} × {r.reps} · Actual{' '}
              {timed ? 'time (mm:ss)' : `weight (${r.unit})`}
              <input
                className={field}
                value={entry.value}
                onChange={(e) =>
                  setLogs({
                    ...logs,
                    [r.id]: { ...entry, value: e.target.value },
                  })
                }
                placeholder={timed ? '7:30' : 'Actual weight'}
              />
            </label>
            <label className="block text-sm">
              How did it go?
              <select
                className={field}
                value={entry.outcome}
                onChange={(e) =>
                  setLogs({
                    ...logs,
                    [r.id]: {
                      ...entry,
                      outcome: e.target.value as typeof entry.outcome,
                    },
                  })
                }
              >
                <option value="hard">Completed all sets/reps but hard</option>
                <option value="comfortable">
                  Completed all sets/reps but comfortable
                </option>
                <option value="missed">
                  Missed sets/reps — repeat or adjust manually
                </option>
              </select>
            </label>
            <p className="text-xs text-zinc-400">
              Completed means every prescribed rep with good form and intended
              range of motion. Previous-performance targets use the plan’s
              standard increase for hard completion, its larger increase for
              comfortable completion, and repeat the logged load after missed
              reps.
            </p>
          </div>
        )
      })}
      <label className="block text-sm">
        Other weights / scaling notes
        <input
          className={field}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Workout notes
        <textarea
          className={field}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
        />
      </label>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={rx}
          onChange={(e) => setRx(e.target.checked)}
        />
        Completed as prescribed (Rx)
      </label>
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          disabled={busy}
          className="rounded-lg bg-orange-600 px-4 py-2 disabled:opacity-50"
        >
          {busy
            ? 'Saving…'
            : existing
              ? 'Save Corrections'
              : 'Save & Mark Completed'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(false)}
          className="rounded-lg bg-zinc-800 px-4 py-2"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
