'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [supabase] = useState(() => createClient())

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('error') === 'recovery') {
      setError('This reset link is invalid or has expired. Request a new one below.')
    }
  }, [])

  async function requestReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setSent(false)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })
      if (error) setError(error.message)
      else setSent(true)
    } catch {
      setError('Could not send the request. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold mb-2">Reset your password</h1>
      <p className="text-sm text-zinc-400 mb-6">Enter your account email to request a reset link.</p>
      <form onSubmit={requestReset} className="space-y-4">
        <div>
          <label htmlFor="reset-email" className="block text-sm font-medium text-zinc-300 mb-1">Email</label>
          <input id="reset-email" type="email" autoComplete="email" required value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none" />
        </div>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        {sent && <p role="status" className="text-sm text-green-400">If an account exists for that email, a reset link has been sent. Check your inbox and spam folder.</p>}
        <button type="submit" disabled={loading}
          className="w-full rounded-lg bg-orange-600 px-4 py-2.5 font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition">
          {loading ? 'Sending...' : 'Send reset link'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm"><Link href="/auth/login" className="text-orange-400 hover:underline">Back to log in</Link></p>
    </div>
  )
}
