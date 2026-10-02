'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
export function DeletePlanButton({
  planId,
  title,
}: {
  planId: string
  title: string
}) {
  const [open, setOpen] = useState(false),
    [typed, setTyped] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const router = useRouter()
  async function remove() {
    setBusy(true)
    setError('')
    try {
      const { error } = await createClient().rpc('delete_training_program', {
        p_plan: planId,
        p_confirmation: typed,
      })
      if (error) throw error
      router.replace('/admin/plans')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete plan.')
    } finally {
      setBusy(false)
    }
  }
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-red-400"
      >
        Delete Plan
      </button>
    )
  return (
    <div className="space-y-3 rounded-lg border border-red-800 bg-red-950/20 p-4">
      <p className="font-medium">Delete “{title}”?</p>
      <p className="text-sm text-zinc-300">
        This permanently removes this plan, its sessions, all user enrollments,
        and their results from every run. Profiles, personal records, and daily
        WOD results stay intact. To hide a plan instead, edit it and turn off
        Published.
      </p>
      <label className="block text-sm">
        Type the exact title to confirm
        <input
          autoComplete="off"
          className="mt-1 w-full rounded border border-zinc-600 bg-zinc-900 p-2"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      </label>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={busy || typed !== title}
          onClick={remove}
          className="rounded-lg bg-red-700 px-4 py-2 disabled:opacity-40"
        >
          {busy ? 'Deleting…' : 'Permanently Delete Plan'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setOpen(false)
            setTyped('')
            setError('')
          }}
          className="text-sm"
        >
          Cancel
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
