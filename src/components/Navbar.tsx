import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AuthButton } from './AuthButton'

export async function Navbar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let isAdmin = false
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()
    isAdmin = profile?.is_admin ?? false
  }

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-xl font-bold tracking-tight text-orange-500">
          WOD Tracker
        </Link>

        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link href="/" className="text-zinc-300 hover:text-white transition">
            Today
          </Link>
          <Link href="/plans" className="text-zinc-300 hover:text-white transition">
            Plans
          </Link>
          <Link href="/workouts" className="text-zinc-300 hover:text-white transition">
            History
          </Link>
          <Link href="/exercises" className="text-zinc-300 hover:text-white transition">
            Exercises
          </Link>
          {user && (
            <Link href="/leaderboard" className="text-zinc-300 hover:text-white transition">
              Leaderboard
            </Link>
          )}
          {isAdmin && (
            <Link href="/admin" className="text-orange-400 hover:text-orange-300 transition">
              Admin
            </Link>
          )}
          <AuthButton user={user} />
        </nav>
      </div>
    </header>
  )
}
