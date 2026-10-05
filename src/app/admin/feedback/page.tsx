import { requireAdmin } from "@/lib/admin-access";
import { AdminSupportQueue } from "@/components/AdminSupportQueue";
import type { FeedbackReport } from "@/lib/support";
import Link from "next/link";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; report?: string }>;
}) {
  const client = await requireAdmin();
  const params = await searchParams;
  const page = Math.max(
    0,
    Math.min(100000, Number.parseInt(params.page || "0", 10) || 0),
  );
  const report = params.report && /^[0-9a-f-]{36}$/i.test(params.report) ? params.report : null;
  let query = client
    .from("feedback_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id");
  if (report) query = query.eq("id", report);
  const { data, error } = await query
    .range(report ? 0 : page * 100, report ? 0 : page * 100 + 99)
    .returns<FeedbackReport[]>();
  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-orange-400">
        ← Admin
      </Link>
      <h1 className="text-3xl font-bold">Feedback reports</h1>
      {report && <Link href="/admin/feedback" className="inline-block text-orange-400">Show all reports →</Link>}

      {error ? (
        <p role="alert" className="text-red-400">
          Could not load this log. Check the migration and reload.
        </p>
      ) : (
        <AdminSupportQueue reports={data || []} />
      )}
      <nav className="flex gap-4">
        {!report && page > 0 && (
          <Link href={`?page=${page - 1}`} className="text-orange-400">
            Newer
          </Link>
        )}
        {!report && data?.length === 100 && (
          <Link href={`?page=${page + 1}`} className="text-orange-400">
            Older
          </Link>
        )}
      </nav>
    </div>
  );
}
