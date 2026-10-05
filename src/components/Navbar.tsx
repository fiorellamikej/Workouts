import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AuthButton } from "./AuthButton";
import { AdminFeedbackAlerts } from "./AdminFeedbackAlerts";

export async function Navbar() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("is_admin,display_name").eq("id", user.id).maybeSingle() : { data: null };
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/dashboard" className="text-xl font-bold tracking-tight text-orange-500">Sword and Shield</Link>
        <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {[["/dashboard", "Todays WOD"], ["/plans", "Training Programs"], ["/heroes", "Hero WODs"]].map(([href, label]) => <Link key={href} href={href} className="min-h-11 rounded-lg px-2 py-3 text-zinc-300 hover:bg-zinc-800 hover:text-white">{label}</Link>)}
          {user && <Link href="/feedback" className="min-h-11 rounded-lg px-2 py-3 text-zinc-300 hover:bg-zinc-800 hover:text-white">Feedback</Link>}
          {profile?.is_admin && <AdminFeedbackAlerts ribbon />}
          <AuthButton user={user} displayName={profile?.display_name} />
        </nav>
      </div>
    </header>
  );
}
