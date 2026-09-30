'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function AdminWorkoutForm() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [workoutDate, setWorkoutDate] = useState(today)
  const [workoutType, setWorkoutType] = useState('for_time')
  const [timeCap, setTimeCap] = useState('')
  const [notes, setNotes] = useState('')
  const [existingId, setExistingId] = useState<string | null>(null)

  useEffect(() => {
    async function loadExisting() {
      const { data } = await supabase
        .from('workouts')
        .select('*')
        .eq('workout_date', workoutDate)
        .single()

      if (data) {
        setExistingId(data.id)
        setTitle(data.title)
        setDescription(data.description || '')
        setWorkoutType(data.workout_type)
        setTimeCap(data.time_cap_seconds ? String(Math.floor(data.time_cap_seconds / 60)) : '')
        setNotes(data.notes || '')
      } else {
        setExistingId(null)
        setTitle('')
        setDescription('')
        setWorkoutType('for_time')
        setTimeCap('')
        setNotes('')
      }
    }
    loadExisting()
  }, [workoutDate, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Not authenticated')
      setLoading(false)
      return
    }

    const payload = {
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
      result = await supabase.from('workouts').update(payload).eq('id', existingId)
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
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">Date</label>
          <input
            type="date"
            value={workoutDate}
            onChange={(e) => setWorkoutDate(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">Type</label>
          <select
            value={workoutType}
            onChange={(e) => setWorkoutType(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
          >
            <option value="for_time">For Time</option>
            <option value="amrap">AMRAP</option>
            <option value="emom">EMOM</option>
            <option value="strength">Strength</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Title</label>
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
        <label className="block text-sm font-medium text-zinc-300 mb-1">Description (the actual WOD)</label>
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
          <label className="block text-sm font-medium text-zinc-300 mb-1">Time Cap (minutes, optional)</label>
          <input
            type="number"
            value={timeCap}
            onChange={(e) => setTimeCap(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
            placeholder="e.g. 15"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
            placeholder="Scaling options, etc."
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {message && <p className="text-sm text-green-400">{message}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-orange-600 px-6 py-2.5 font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition"
      >
        {loading ? 'Saving...' : existingId ? 'Update WOD' : 'Post WOD'}
      </button>
    </form>
  )
}
