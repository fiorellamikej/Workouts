import { requireAdmin } from "@/lib/admin-access";
import type { Registration } from "@/lib/support";
import Link from "next/link";
export default async function UsersPage({
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
    .from("registration_log")
    .select("*")
    .order("registered_at", { ascending: false })
    .order("user_id")
    .range(page * 100, page * 100 + 99)
    .returns<Registration[]>();
  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-orange-400">
        ← Admin
      </Link>
      <h1 className="text-3xl font-bold">Registrations &amp; email list</h1>
      <p className="text-zinc-400">
        All registrations are logged. The mailing-list export includes only
        confirmed accounts that opted in.
      </p>
      <div className="flex flex-wrap gap-3">
        <a
          className="rounded bg-orange-600 px-4 py-3"
          href="/api/admin/registrations?segment=subscribers"
        >
          Download opted-in mailing list
        </a>
        <a
          className="rounded border border-zinc-700 px-4 py-3"
          href="/api/admin/registrations?segment=all"
        >
          Download all registrations
        </a>
      </div>
      {error ? (
        <p role="alert" className="text-red-400">
          Could not load registrations. Check the migration and reload.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[
                  "Email",
                  "Registered (UTC)",
                  "Confirmed",
                  "Email updates",
                ].map((h) => (
                  <th key={h} className="p-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.map((r) => (
                <tr key={r.user_id} className="border-t border-zinc-800">
                  <td className="p-3">{r.email || "No email"}</td>
                  <td className="p-3">
                    {new Date(r.registered_at).toISOString().slice(0, 10)}
                  </td>
                  <td className="p-3">{r.email_confirmed_at ? "Yes" : "No"}</td>
                  <td className="p-3">
                    {r.mailing_opt_in ? "Opted in" : "Off"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.length && <p>No registrations in this page.</p>}
        </div>
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
