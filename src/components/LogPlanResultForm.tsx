'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { parseTimeInput } from '@/lib/utils'

export function LogPlanResultForm({
  enrollmentId,
  sessionId,
}: {
  enrollmentId: string
  sessionId: string
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const [timeInput, setTimeInput] = useState('')
  const [rounds, setRounds] = useState('')
  const [extraReps, setExtraReps] = useState('')
  const [weightUsed, setWeightUsed] = useState('')
  const [isRx, setIsRx] = useState(true)
  const [notes, setNotes] = useState('')
  const [mode, setMode] = useState<'time' | 'amrap' | 'just_done'>('time')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Not logged in')
      setLoading(false)
      return
    }

    const payload = {
      user_id: user.id,
      enrollment_id: enrollmentId,
      session_id: sessionId,
      completion_time_seconds: mode === 'time' ? parseTimeInput(timeInput) : null,
      rounds: mode === 'amrap' ? parseInt(rounds) || null : null,
      extra_reps: mode === 'amrap' ? parseInt(extraReps) || null : null,
      weight_used: weightUsed || null,
      is_rx: isRx,
      notes: notes || null,
    }

    const { error } = await supabase.from('plan_results').insert(payload)

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.refresh()
    setLoading(false)
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-orange-400 hover:text-orange-300 font-medium"
      >
        Log result →
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2 text-xs">
        {(['time', 'amrap', 'just_done'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded px-2.5 py-1 ${
              mode === m ? 'bg-orange-600 text-white' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            {m === 'time' ? 'Time' : m === 'amrap' ? 'AMRAP' : 'Just Done'}
          </button>
        ))}
      </div>

      {mode === 'time' && (
        <input
          type="text"
          value={timeInput}
          onChange={(e) => setTimeInput(e.target.value)}
          placeholder="Time mm:ss"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none font-mono"
        />
      )}

      {mode === 'amrap' && (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            value={rounds}
            onChange={(e) => setRounds(e.target.value)}
            placeholder="Rounds"
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
          />
          <input
            type="number"
            value={extraReps}
            onChange={(e) => setExtraReps(e.target.value)}
            placeholder="Extra reps"
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
          />
        </div>
      )}

      <input
        type="text"
        value={weightUsed}
        onChange={(e) => setWeightUsed(e.target.value)}
        placeholder="Weight used (optional)"
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
      />

      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={isRx}
          onChange={(e) => setIsRx(e.target.checked)}
          className="rounded border-zinc-600 bg-zinc-800 text-orange-500"
        />
        Rx
      </label>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
