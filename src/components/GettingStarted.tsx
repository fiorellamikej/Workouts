"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function GettingStarted({ initiallyDismissed }: { initiallyDismissed: boolean }) {
  const [dismissed, setDismissed] = useState(initiallyDismissed);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function dismiss() {
    setSaving(true);
    setError(null);
    try {
      const client = createClient();
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError || !user) throw new Error("Sign in again before saving your preference.");
      const { error } = await client.from("user_onboarding").upsert({ user_id: user.id, dismissed_at: new Date().toISOString() });
      if (error) throw new Error("Could not save your preference. Please try again.");
      setDismissed(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save your preference. Please try again.");
    } finally { setSaving(false); }
  }
  if (dismissed) return <button type="button" onClick={() => setDismissed(false)} className="text-sm text-orange-400 hover:underline">Show the how-to guide</button>;
  return (
    <section aria-labelledby="getting-started-title" className="space-y-4 rounded-xl border border-orange-700/60 bg-orange-950/20 p-5 sm:p-6">
      <h2 id="getting-started-title" className="text-xl font-semibold">How to use Sword and Shield</h2>
      <ol className="list-decimal space-y-3 pl-5 text-zinc-300">
        <li><Link href="/profile" className="font-medium text-orange-400 hover:underline">Fill out your profile and PRs.</Link> Workouts with personalized targets use those inputs to scale your prescribed loads. Programs with progression rules also use your logged performance to guide future targets. If a PR is missing, enter it to get a personalized target.</li>
        <li><Link href="/dashboard" className="font-medium text-orange-400 hover:underline">Start in Today.</Link> Not sure what to do? The Workout of the Day (WOD) is in the Today tab. If no WOD is posted, browse the plans or workout history.</li>
        <li><Link href="/plans" className="font-medium text-orange-400 hover:underline">Explore Plans.</Link> All published programs are in the Plans tab, with a description, intent, and schedule. Review the overview, choose a program, and log your workouts to track progression.</li>
        <li><Link href="/feedback" className="font-medium text-orange-400 hover:underline">Use Feedback for help.</Link> Report errors or send suggestions through the Feedback tab.</li>
      </ol>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <button type="button" onClick={dismiss} disabled={saving} className="rounded-lg bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-500 disabled:opacity-50">{saving ? "Saving..." : "Got it"}</button>
      <p className="text-xs text-zinc-400">You can reopen this guide from Today anytime.</p>
    </section>
  );
}
