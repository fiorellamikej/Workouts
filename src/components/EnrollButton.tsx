'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function EnrollButton({ planId }: { planId: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleEnroll = async () => {
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be logged in')
      setLoading(false)
      return
    }

    const { error } = await supabase.from('user_plan_enrollments').insert({
      user_id: user.id,
      plan_id: planId,
      status: 'active',
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.refresh()
    setLoading(false)
  }

  return (
    <div>
      <button
        onClick={handleEnroll}
        disabled={loading}
        className="rounded-lg bg-orange-600 px-5 py-2.5 font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition"
      >
        {loading ? 'Starting...' : 'Start This Plan'}
      </button>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  )
}
