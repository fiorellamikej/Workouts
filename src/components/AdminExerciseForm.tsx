'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function AdminExerciseForm() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [muscleGroups, setMuscleGroups] = useState('')

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

    const groups = muscleGroups
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean)

    const { error } = await supabase.from('exercises').insert({
      name,
      description: description || null,
      video_url: videoUrl || null,
      muscle_groups: groups.length ? groups : null,
      created_by: user.id,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setMessage('Exercise added!')
    setName('')
    setDescription('')
    setVideoUrl('')
    setMuscleGroups('')
    setLoading(false)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Exercise Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
          placeholder="e.g. Thruster, Muscle-up, Handstand Push-up"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Description / Standards</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
          placeholder="Movement standards, common faults, etc."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">
          How-to Video URL (YouTube or Vimeo)
        </label>
        <input
          type="url"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
          placeholder="https://www.youtube.com/watch?v=..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">
          Muscle Groups (comma separated)
        </label>
        <input
          type="text"
          value={muscleGroups}
          onChange={(e) => setMuscleGroups(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
          placeholder="legs, shoulders, core"
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {message && <p className="text-sm text-green-400">{message}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-orange-600 px-6 py-2.5 font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition"
      >
        {loading ? 'Saving...' : 'Add Exercise'}
      </button>
    </form>
  )
}
