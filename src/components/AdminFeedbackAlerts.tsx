"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FeedbackSummary } from "@/lib/beta-activity";

export function AdminFeedbackAlerts({ ribbon = false }: { ribbon?: boolean }) {
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const { data, error } = await createClient().rpc("admin_feedback_notifications");
      if (error) { setError("Could not load feedback alerts. Check the new migration."); return; }
      setSummary(data as FeedbackSummary);
      setError("");
    } catch { setError("Could not load feedback alerts. Check your connection and retry."); }
  }, []);
  useEffect(() => {
    void refresh();
    const check = () => { if (document.visibilityState === "visible") void refresh(); };
    const interval = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("feedback-alerts-changed", check);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("feedback-alerts-changed", check);
    };
  }, [refresh]);
  async function markRead() {
    if (!summary?.reports.length || busy) return;
    setBusy(true);
    // Only acknowledge the IDs actually displayed, preserving concurrent new reports.
    try {
      const { error } = await createClient().rpc("mark_feedback_notifications_read", {
        p_ids: summary.reports.map((report) => report.id),
      });
      if (error) setError("Could not mark alerts read. Please retry.");
      else {
        await refresh();
        window.dispatchEvent(new Event("feedback-alerts-changed"));
      }
    } catch { setError("Could not mark alerts read. Check your connection and retry."); }
    finally { setBusy(false); }
  }
  const count = summary?.total;
  if (ribbon) return (
    <details className="relative">
      <summary className="min-h-11 cursor-pointer rounded-lg px-2 py-3 text-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400">
        Admin {count ? <span className="ml-1 rounded-full bg-orange-600 px-2 py-1 text-xs text-white" aria-label={`${count} new feedback reports`}>{count}</span> : null}
      </summary>
      <div className="absolute right-0 z-50 w-64 space-y-1 rounded-xl border border-zinc-700 bg-zinc-950 p-3 shadow-xl">
        <Link href="/admin" className="block rounded p-3 hover:bg-zinc-800">Admin home</Link>
        <Link href="/admin/activity" className="block rounded p-3 hover:bg-zinc-800">Beta Activity</Link>
        <Link href="/admin/feedback" className="block rounded p-3 hover:bg-zinc-800">Feedback reports {count ? `(${count} new)` : ""}</Link>
        {error && <p role="status" className="p-2 text-xs text-amber-400">Alerts unavailable</p>}
      </div>
    </details>
  );
  return (
    <section aria-labelledby="feedback-alert-title" className="space-y-3 rounded-xl border border-orange-800 bg-zinc-900/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="feedback-alert-title" className="font-semibold">New bug and suggestion alerts</h2>
        <Link href="/admin/activity" className="rounded-lg border border-zinc-700 px-4 py-3 text-orange-400">Beta Activity →</Link>
      </div>
      <p role="status" className="text-sm text-zinc-300">{summary ? `${summary.bugs} new bugs · ${summary.suggestions} new suggestions` : "Loading alerts..."}</p>
      {summary?.reports.length ? (
        <>
          <ul className="space-y-2">
            {summary.reports.map((report) => <li key={report.id}><Link href={`/admin/feedback?report=${report.id}`} className="block rounded-lg bg-zinc-800 px-3 py-3 text-sm hover:bg-zinc-700">{report.kind === "bug" ? "Bug" : "Suggestion"}: {report.title}</Link></li>)}
          </ul>
          <button type="button" disabled={busy} onClick={() => void markRead()} className="min-h-11 rounded-lg border border-orange-700 px-4 py-2 disabled:opacity-50">{busy ? "Saving..." : "Mark displayed alerts read"}</button>
          <p className="text-xs text-zinc-400">Read status is personal to you. It does not resolve reports. Up to 20 new alerts are shown at once.</p>
        </>
      ) : summary ? <p className="text-sm text-zinc-400">You have no unread reports.</p> : null}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <Link href="/admin/feedback" className="inline-block text-sm text-orange-400">Open feedback queue →</Link>
    </section>
  );
}
