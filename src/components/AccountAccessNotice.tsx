import Link from "next/link";

export function AccountAccessNotice() {
  return (
    <section aria-label="Free access and account information" className="mt-5 space-y-3 rounded-xl border border-zinc-700 bg-zinc-900/50 p-4 text-sm text-zinc-300">
      <p><strong className="text-white">Free to browse. Free to sign up.</strong> Browse the WOD, workout history, exercises, Hero WODs, and published plans without an account. Sign up for the full training experience: personalized scaling, workout logging, PRs, and progression saved to your profile.</p>
      <p>Your email connects you to your profile and is used for login, account confirmation, and password recovery. We also store your display name, the profile details, PRs, and workouts you choose to save, your account preferences, activity dates for badges and streaks, and any feedback you submit. Technical error records help us fix problems. News and training emails are optional.</p>
      <p>Your display name is public. Daily WOD leaderboard results are visible to signed-in users.</p>
      <Link href="/dashboard" className="inline-block rounded-lg border border-orange-700 px-4 py-2 font-medium text-orange-400 hover:border-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400">Browse without an account</Link>
    </section>
  );
}
