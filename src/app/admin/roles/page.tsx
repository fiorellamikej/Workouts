import Link from "next/link";
import { requireAdmin } from "@/lib/admin-access";
import { RoleManager } from "@/components/RoleManager";

type Roster = {
  rows: { user_id: string; display_name: string | null; email: string | null; role: "coach" | "owner" }[];
  coach_count: number;
  owner_count: number;
  total: number;
};

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string; email?: string }> }) {
  const db = await requireAdmin();
  const params = await searchParams;
  const page = Math.max(0, Math.min(10000, Number.parseInt(params.page || "0", 10) || 0));
  const { data, error } = await db.rpc("staff_role_roster", { p_page: page });
  const roster = data as Roster | null;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">User roles</h1>
      <p>Select an existing account by email. Coaches use the COACH panel; owners retain Admin. The last owner cannot be removed.</p>
      <RoleManager key={params.email || "search"} initialQuery={params.email?.slice(0, 150) || ""} />
      <section className="space-y-4">
        <h2 className="text-xl font-bold">Coach and Owner roster</h2>
        {error || !roster ? (
          <p role="alert" className="text-red-400">Could not load staff roles. Apply the roster migration and reload.</p>
        ) : (
          <>
            <p>{roster.coach_count} Coaches / {roster.owner_count} Owners</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr>{["Name", "Email", "Role", "Manage"].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
                <tbody>{roster.rows.map(account => (
                  <tr key={account.user_id} className="border-t border-zinc-700">
                    <td className="p-3">{account.display_name || "Unnamed account"}</td>
                    <td className="p-3">{account.email || "No email available"}</td>
                    <td className="p-3 capitalize">{account.role}</td>
                    <td className="p-3">{account.email && <Link href={`?email=${encodeURIComponent(account.email)}&page=${page}`} className="inline-block min-h-11 py-3 text-orange-400">Change role</Link>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {!roster.rows.length && <p>No staff accounts on this page.</p>}
            <nav aria-label="Staff roster pages" className="flex gap-4">
              {page > 0 && <Link href={`?page=${page - 1}`} className="text-orange-400">Previous</Link>}
              {(page + 1) * 50 < roster.total && <Link href={`?page=${page + 1}`} className="text-orange-400">Next</Link>}
            </nav>
          </>
        )}
      </section>
    </div>
  );
}
