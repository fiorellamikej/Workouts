'use client'

import { wodToday, WOD_TYPES } from '@/lib/daily-wod'
import { PrescriptionEditor } from '@/components/PrescriptionEditor'
import { validatePrescriptions, type Prescription } from '@/lib/training'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function AdminWorkoutForm() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [loading, setLoading] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const today = wodToday()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [workoutDate, setWorkoutDate] = useState(today)
  const [workoutType, setWorkoutType] = useState('for_time')
  const [timeCap, setTimeCap] = useState('')
  const [notes, setNotes] = useState('')
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [existingId, setExistingId] = useState<string | null>(null)

  const clearForm = () => {
    setPrescriptions([])
    setExistingId(null)
    setTitle('')
    setDescription('')
    setWorkoutType('for_time')
    setTimeCap('')
    setNotes('')
    setConfirmDelete(false)
  }

  useEffect(() => {
    let active = true
    async function loadExisting() {
      setLoadingExisting(true)
      setLoadFailed(false)
      setError(null)
      setMessage(null)
      setConfirmDelete(false)
      try {
        const { data, error } = await supabase.from('workouts').select('*')
          .eq('workout_date', workoutDate).maybeSingle()
        if (!active) return
        if (error) { setLoadFailed(true); clearForm(); setError('Could not load this date. Reload before editing.'); return }
        if (data) {
          setPrescriptions(data.prescriptions || [])
          setExistingId(data.id)
          setTitle(data.title)
          setDescription(data.description || '')
          setWorkoutType(data.workout_type)
          setTimeCap(data.time_cap_seconds ? String(Math.floor(data.time_cap_seconds / 60)) : '')
          setNotes(data.notes || '')
        } else clearForm()
      } catch {
        if (active) { setLoadFailed(true); clearForm(); setError('Could not load this date. Check your connection and reload.'); }
      } finally { if (active) setLoadingExisting(false) }
    }
    void loadExisting()
    return () => { active = false }
  }, [workoutDate, supabase])

  const handleDelete = async () => {
    if (!existingId || loading || loadingExisting) return
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const { error } = await supabase.rpc('delete_daily_wod', { p_workout_id: existingId })
      if (error) throw error
      clearForm()
      setMessage('WOD deleted. You can post a new workout for this date.')
      router.refresh()
    } catch {
      setError('Could not delete this WOD. Check your admin access and database migration, then reload before retrying.')
    } finally { setLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading || loadingExisting || loadFailed) return
    setConfirmDelete(false)
    setLoading(true)
    setError(null)
    setMessage(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('Not authenticated')
      setLoading(false)
      return
    }

    const invalid =
      (workoutType === 'rest' && prescriptions.length ? 'Rest days cannot have personalized training targets.' : null) ||
      validatePrescriptions(prescriptions) ||
      (prescriptions.some((r) => r.strategy === 'previous')
        ? 'Daily WOD targets use percentages. Performance progression is available within programs.'
        : null)
    if (invalid) {
      setError(invalid)
      setLoading(false)
      return
    }
    const payload = {
      prescriptions,
      title,
      description,
      workout_date: workoutDate,
      workout_type: workoutType,
      time_cap_seconds: timeCap ? parseInt(timeCap) * 60 : null,
      notes: notes || null,
      created_by: user.id,
    }

    let result
    if (existingId) {
      result = await supabase
        .from('workouts')
        .update(payload)
        .eq('id', existingId)
    } else {
      result = await supabase.from('workouts').insert(payload)
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    setMessage(existingId ? 'WOD updated!' : 'WOD posted!')
    setLoading(false)
    router.refresh()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Date
          </label>
          <input
            type="date"
            disabled={loading}
            value={workoutDate}
            onChange={(e) => { setLoadingExisting(true); setConfirmDelete(false); setWorkoutDate(e.target.value) }}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Type
          </label>
          <select
            disabled={loading || loadingExisting || loadFailed}
            value={workoutType}
            onChange={(e) => setWorkoutType(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
          >
            {WOD_TYPES.map((type) => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}
          </select>
        </div>
      </div>

      <fieldset disabled={loading || loadingExisting || loadFailed} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
          placeholder="e.g. Fran, Murph, or custom name"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">
          Description (the actual WOD)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={8}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none font-mono text-sm"
          placeholder={`21-15-9\nThrusters (95/65)\nPull-ups`}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Time Cap (minutes, optional)
          </label>
          <input
            type="number"
            value={timeCap}
            onChange={(e) => setTimeCap(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
            placeholder="e.g. 15"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Notes
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
            placeholder="Scaling options, etc."
          />
        </div>
      </div>

      <PrescriptionEditor
        allowPrevious={false}
        value={prescriptions}
        onChange={setPrescriptions}
      />

      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {message && <p role="status" className="text-sm text-green-400">{message}</p>}

      <button
        type="submit"
        disabled={loading || loadingExisting || loadFailed}
        className="rounded-lg bg-orange-600 px-6 py-2.5 font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition"
      >
        {loadingExisting ? 'Loading WOD...' : loading ? 'Working...' : existingId ? 'Update WOD' : 'Post WOD'}
      </button>
      </fieldset>
      {existingId && !loadingExisting && (
        <div className="space-y-3 border-t border-zinc-700 pt-4">
          {!confirmDelete ? (
            <button type="button" disabled={loading} onClick={() => setConfirmDelete(true)} className="rounded-lg border border-red-700 px-4 py-2 text-red-400 disabled:opacity-50">Delete this WOD</button>
          ) : (
            <div role="group" aria-label="Confirm WOD deletion" className="space-y-3 rounded-lg border border-red-800 bg-red-950/20 p-4">
              <p className="font-medium text-red-300">Delete {title} on {workoutDate}?</p>
              <p className="text-sm text-zinc-300">This permanently removes the daily WOD and all results and exercise logs linked to it, including other users&apos; entries. This cannot be undone. Hero WODs and training plans are separate.</p>
              <div className="flex flex-wrap gap-3">
                <button type="button" disabled={loading} onClick={handleDelete} className="rounded-lg bg-red-700 px-4 py-2 text-white disabled:opacity-50">{loading ? 'Deleting...' : 'Permanently delete WOD'}</button>
                <button type="button" disabled={loading} onClick={() => setConfirmDelete(false)} className="rounded-lg border border-zinc-600 px-4 py-2 disabled:opacity-50">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  )
}
