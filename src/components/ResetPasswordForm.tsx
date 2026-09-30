'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export function ResetPasswordForm() {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [supabase] = useState(() => createClient())

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (password !== confirmation) {
      setError('The passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setError(error.message)
        return
      }
      setPassword('')
      setConfirmation('')
      setComplete(true)
      // End the recovery session on this browser after saving the password.
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      setError('Could not finish the request. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (complete) {
    return <div role="status" className="space-y-4">
      <p className="text-green-400">Your password has been updated.</p>
      <Link href="/auth/login" className="inline-block rounded-lg bg-orange-600 px-4 py-2.5 font-medium text-white hover:bg-orange-500">Log in with your new password</Link>
    </div>
  }

  return <form onSubmit={savePassword} className="space-y-4">
    <div>
      <label htmlFor="new-password" className="block text-sm font-medium text-zinc-300 mb-1">New password</label>
      <input id="new-password" type="password" autoComplete="new-password" required minLength={8} value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none" />
      <p className="mt-1 text-xs text-zinc-400">Use at least 8 characters.</p>
    </div>
    <div>
      <label htmlFor="confirm-password" className="block text-sm font-medium text-zinc-300 mb-1">Confirm new password</label>
      <input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none" />
    </div>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    <button type="submit" disabled={loading}
      className="w-full rounded-lg bg-orange-600 px-4 py-2.5 font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition">
      {loading ? 'Saving...' : 'Save new password'}
    </button>
  </form>
}
