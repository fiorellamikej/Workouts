import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AuthButton } from './AuthButton'
import { AdminFeedbackAlerts } from './AdminFeedbackAlerts'
import { NavDropdown } from './NavDropdown'
export async function Navbar() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  const { data: profile } = user ? await db.from('profiles').select('is_admin,display_name').eq('id', user.id).maybeSingle() : { data: null }
  const { data: staffRole } = user ? await db.rpc("my_staff_role") : { data: "member" };
  return <header className="sticky top-0 z-50 border-b border-zinc-700 bg-zinc-950/95 backdrop-blur">
    <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
      <Link href="/dashboard" className="min-w-0 text-sm font-bold uppercase tracking-tight text-orange-400 sm:text-xl">Sword and Shield</Link>
      <nav aria-label="Main navigation" className="flex items-center gap-2">
        <NavDropdown label={<span aria-hidden="true">☰</span>} ariaLabel="Open navigation menu">
          {[["/dashboard", "Home / Today's Workout"], ["/plans", "Training Programs"], ["/heroes", "Hero WODs"], ["/workouts", "Workout History"], ["/leaderboard", "Leaderboards"], ["/faq", "FAQ"]].map(([href, label]) => <Link className="block min-h-11 px-3 py-3 text-sm hover:bg-zinc-800" href={href} key={href}>{label}</Link>)}
          {staffRole === "coach" && <Link href="/coach" className="block min-h-11 px-3 py-3 text-orange-300">COACH</Link>}
          {staffRole === "owner" && <><Link href="/admin" className="block min-h-11 px-3 py-3 text-orange-300">Admin</Link><AdminFeedbackAlerts ribbon /></>}
          <div className="border-t border-zinc-700 px-3 py-3"><AuthButton user={user} displayName={profile?.display_name} /></div>
        </NavDropdown>
        <NavDropdown label="Get Help">{[["/feedback", "Give Feedback"], ["/feedback", "Report a Bug"], ["/exercises", "Exercise Examples"], ["/faq", "FAQ"]].map(([href, label]) => <Link key={label} href={href} className="block min-h-11 px-3 py-3 text-sm hover:bg-zinc-800">{label}</Link>)}</NavDropdown>
      </nav>
    </div>
  </header>
}
