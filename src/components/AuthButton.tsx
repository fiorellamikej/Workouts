'use client'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { setOfflineUser } from '@/lib/offline-store'
import type { User } from '@supabase/supabase-js'

export function AuthButton({ user, displayName }: { user: User | null; displayName?: string | null }) {
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await setOfflineUser(null)
    await supabase.auth.signOut()
    router.refresh()
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/auth/login"
          className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 transition"
        >
          Log in
        </Link>
        <Link
          href="/auth/signup"
          className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-500 transition"
        >
          Sign up
        </Link>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <Link href="/profile" className="text-zinc-400 hover:text-white text-sm">
        {displayName || user.email?.split('@')[0] || 'Profile'}
      </Link>
      <button
        onClick={handleSignOut}
        className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 transition"
      >
        Sign out
      </button>
    </div>
  )
}
