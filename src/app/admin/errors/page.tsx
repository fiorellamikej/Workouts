import { requireAdmin } from "@/lib/admin-access";
import { AdminSupportQueue } from "@/components/AdminSupportQueue";
import type { ErrorEvent } from "@/lib/support";
import Link from "next/link";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const client = await requireAdmin();
  const params = await searchParams;
  const page = Math.max(
    0,
    Math.min(100000, Number.parseInt(params.page || "0", 10) || 0),
  );
  const { data, error } = await client
    .from("app_error_events")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id")
    .range(page * 100, page * 100 + 99)
    .returns<ErrorEvent[]>();
  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-orange-400">
        ← Admin
      </Link>
      <h1 className="text-3xl font-bold">Application errors</h1>
      <p className="text-zinc-400">
        Unexpected browser errors, page failures, and reported save failures for
        signed-in users. Match a server digest with Vercel logs for details.
        Passwords, form contents, raw messages, and stacks are not collected.
      </p>
      {error ? (
        <p role="alert" className="text-red-400">
          Could not load this log. Check the migration and reload.
        </p>
      ) : (
        <AdminSupportQueue errors={data || []} />
      )}
      <nav className="flex gap-4">
        {page > 0 && (
          <Link href={`?page=${page - 1}`} className="text-orange-400">
            Newer
          </Link>
        )}
        {data?.length === 100 && (
          <Link href={`?page=${page + 1}`} className="text-orange-400">
            Older
          </Link>
        )}
      </nav>
    </div>
  );
}
