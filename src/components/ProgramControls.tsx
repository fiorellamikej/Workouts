'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
export function ProgramControls({
  enrollmentId,
  planId,
  attempt,
  sessions,
  selectedId,
}: {
  enrollmentId: string
  planId: string
  attempt: number
  sessions: {
    id: string
    title: string
    week_number: number
    day_number: number
  }[]
  selectedId: string | null
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const router = useRouter(),
    index = sessions.findIndex((s) => s.id === selectedId)
  async function select(id: string) {
    if (!id) return
    setBusy(true)
    setError('')
    try {
      const { error } = await createClient().rpc('select_training_day', {
        p_enrollment: enrollmentId,
        p_session: id,
        p_attempt: attempt,
      })
      if (error) throw error
      router.replace(`/plans/${planId}#session-${id}`, { scroll: true })
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change day.')
    } finally {
      setBusy(false)
    }
  }
  async function restart() {
    if (
      !window.confirm(
        `Restart this program as run ${attempt + 1}? Your existing results will be preserved in run history. You will start at the first day with fresh progress.`,
      )
    )
      return
    setBusy(true)
    setError('')
    try {
      const { error } = await createClient().rpc('restart_training_program', {
        p_enrollment: enrollmentId,
        p_expected_attempt: attempt,
      })
      if (error) throw error
      router.replace(`/plans/${planId}#session-${sessions[0]?.id || ''}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not restart.')
    } finally {
      setBusy(false)
    }
  }
  async function leave() {
    if (
      !window.confirm(
        'Leave this program? It will disappear from your active programs. Your results stay saved, and you can rejoin later.',
      )
    )
      return
    setBusy(true)
    setError('')
    try {
      const { error } = await createClient().rpc('leave_training_program', {
        p_enrollment: enrollmentId,
        p_expected_attempt: attempt,
      })
      if (error) throw error
      router.replace('/plans')
      router.refresh()
    } catch (e) {
      setError(
        e && typeof e === 'object' && 'message' in e
          ? String(e.message)
          : 'Could not leave program.',
      )
    } finally {
      setBusy(false)
    }
  }
  const button = 'rounded-lg bg-zinc-800 px-3 py-2 text-sm disabled:opacity-40'
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">
        Run {attempt}. Changing days does not mark them completed or erase
        results.
      </p>
      <label className="block text-sm">
        Selected day
        <select
          disabled={busy || !sessions.length}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3"
          value={selectedId || ''}
          onChange={(e) => select(e.target.value)}
        >
          <option value="" disabled>
            Select a day
          </option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              Week {s.week_number}, day {s.day_number} — {s.title}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          className={button}
          disabled={busy || index <= 0}
          onClick={() => select(sessions[index - 1].id)}
        >
          ← Previous Day
        </button>
        <button
          className={button}
          disabled={busy || index < 0 || index >= sessions.length - 1}
          onClick={() => select(sessions[index + 1].id)}
        >
          Next Day →
        </button>
        <button
          className={button}
          disabled={busy || !sessions.length}
          onClick={restart}
        >
          Restart Program
        </button>
        <button
          className={button + ' text-red-400'}
          disabled={busy}
          onClick={leave}
        >
          Leave Program
        </button>
      </div>
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
export function UndoCompletion({
  enrollmentId,
  resultId,
}: {
  enrollmentId: string
  resultId: string
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const router = useRouter()
  async function undo() {
    if (
      !window.confirm(
        'Mark this session incomplete? Its saved result and exercise logs will be removed. Other sessions will stay as they are.',
      )
    )
      return
    setBusy(true)
    setError('')
    try {
      const { error } = await createClient().rpc('undo_training_completion', {
        p_enrollment: enrollmentId,
        p_result_id: resultId,
      })
      if (error) throw error
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not undo completion.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <button
        disabled={busy}
        onClick={undo}
        className="text-sm text-red-400 disabled:opacity-50"
      >
        {busy ? 'Undoing…' : 'Undo Completion'}
      </button>
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
