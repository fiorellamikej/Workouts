import Link from "next/link";
import { requireAdmin } from "@/lib/admin-access";
import { activityDays, type BetaAthlete, type BetaEvent } from "@/lib/beta-activity";

export const dynamic = "force-dynamic";

function timestamp(value: string | null) {
  return value ? new Date(value).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) : "No tracked activity yet";
}

export default async function BetaActivityPage({ searchParams }: { searchParams: Promise<{ days?: string; page?: string; user?: string }> }) {
  const db = await requireAdmin();
  const params = await searchParams;
  const days = activityDays(params.days);
  const page = Math.max(0, Math.min(2000, Number.parseInt(params.page || "0", 10) || 0));
  const { data, error } = await db.rpc("admin_beta_activity", { p_days: days, p_limit: 50, p_offset: page * 50 });
  const summary = data as { athletes: BetaAthlete[]; total: number } | null;
  const selected = summary?.athletes.find((athlete) => athlete.user_id === params.user);
  const detailQuery = selected ? await db.rpc("admin_beta_activity_detail", { p_user: selected.user_id, p_days: days }) : null;
  const detail = detailQuery?.data as { events: BetaEvent[]; pages: { page_path: string; views: number }[] } | null;
  const base = `/admin/activity?days=${days}&page=${page}`;
  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-orange-400">← Admin home</Link>
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Beta Activity</h1>
        <p className="text-zinc-400">See when testers return, which pages they open, and what they save. Only administrators can access this dashboard.</p>
        <p className="text-sm text-zinc-400">Page tracking starts when this update is installed. A visit ends after 30 minutes without tracked activity. Idle open tabs do not generate activity. Times below are Eastern Time.</p>
      </header>
      <nav aria-label="Activity range" className="flex flex-wrap gap-2">
        {[7, 30, 90].map((range) => <Link key={range} href={`?days=${range}`} aria-current={days === range ? "page" : undefined} className={`min-h-11 rounded-lg px-4 py-3 ${days === range ? "bg-orange-600" : "bg-zinc-800"}`}>Last {range} days</Link>)}
        <Link href={base} className="min-h-11 rounded-lg border border-zinc-700 px-4 py-3">Refresh</Link>
      </nav>
      <p className="text-sm text-zinc-400">Counts use the selected range and saved/submission dates. Last active and last sign-in are all-time; active programs show current enrollment. PR counts are saved records, not edits. Hero attempts stay separate from completed workouts.</p>
      {error ? <p role="alert" className="text-red-400">Could not load Beta Activity. Apply the new migration and reload.</p> : !summary?.athletes.length ? <p>No accounts found.</p> : (
        <>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-left text-sm">
              <caption className="p-3 text-left text-zinc-400">{summary.total} registered accounts · page {page + 1}</caption>
              <thead className="bg-zinc-900"><tr>{["Tester", "Last active", "Visits", "Active days", "Page views", "Workouts", "Hero attempts", "PRs", "Feedback", "Errors"].map((title) => <th scope="col" key={title} className="whitespace-nowrap px-3 py-3">{title}</th>)}</tr></thead>
              <tbody>{summary.athletes.map((athlete) => <tr key={athlete.user_id} className="border-t border-zinc-800 align-top">
                <th scope="row" className="px-3 py-3 font-normal"><Link href={`${base}&user=${athlete.user_id}#tester-detail`} className="inline-block min-h-11 py-2 font-medium text-orange-400 hover:underline">{athlete.display_name}</Link><p className="text-xs text-zinc-500">Joined {timestamp(athlete.registered_at)}</p></th>
                <td className="px-3 py-3">{timestamp(athlete.last_active)}</td>
                {[athlete.visits, athlete.active_days, athlete.page_views, athlete.completed_workouts, athlete.hero_attempts, athlete.prs_logged, athlete.feedback_count, athlete.error_count].map((count, index) => <td key={index} className="px-3 py-3 tabular-nums">{count}</td>)}
              </tr>)}</tbody>
            </table>
          </div>
          <nav aria-label="Tester pages" className="flex gap-3">
            {page > 0 && <Link href={`?days=${days}&page=${page - 1}`} className="rounded bg-zinc-800 px-4 py-3">← Previous</Link>}
            {(page + 1) * 50 < summary.total && <Link href={`?days=${days}&page=${page + 1}`} className="rounded bg-zinc-800 px-4 py-3">Next →</Link>}
          </nav>
        </>
      )}
      {selected && <section id="tester-detail" className="scroll-mt-24 space-y-4 rounded-xl border border-zinc-800 p-5">
        <h2 className="text-xl font-semibold">{selected.display_name}</h2>
        <p className="text-sm text-zinc-400">Last sign-in: {selected.last_sign_in_at ? timestamp(selected.last_sign_in_at) : "Never recorded"}. Sign-in time is different from actual activity.</p>
        <p>Active programs: {selected.plans.length ? selected.plans.join(", ") : "None"}</p>
        <p className="text-xs text-zinc-400">Account ID: {selected.user_id}. This view shows activity labels, not private program scores, notes, or set details.</p>
        {detailQuery?.error ? <p role="alert" className="text-red-400">Could not load tester details.</p> : <>
          <h3 className="font-semibold">Most visited pages</h3>
          {detail?.pages.length ? <ul className="space-y-2">{detail.pages.map((row) => <li key={row.page_path} className="break-all text-sm">{row.page_path} · {row.views} views</li>)}</ul> : <p className="text-sm text-zinc-400">No page views in this range.</p>}
          <h3 className="font-semibold">Recent activity</h3>
          {detail?.events.length ? <ol className="space-y-3">{detail.events.map((event, index) => <li key={index} className="rounded-lg bg-zinc-900 p-3"><p className="text-sm">{event.category.replaceAll("_", " ")} · {event.label}</p><p className="text-xs text-zinc-400">{timestamp(event.occurred_at)}</p></li>)}</ol> : <p className="text-sm text-zinc-400">No saved or tracked activity in this range.</p>}
        </>}
      </section>}
    </div>
  );
}
