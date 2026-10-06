import { WodImportPanel } from "@/components/WodImportPanel";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminWodManager } from "@/components/AdminWodManager";
import { AdminExerciseForm } from "@/components/AdminExerciseForm";
import Link from "next/link";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return (
      <div className="text-center py-12">
        <div className="flex flex-wrap gap-4"><Link href="/admin/roles" className="text-orange-400">User roles</Link><Link href="/admin/reviews" className="text-orange-400">Coach reviews</Link><Link href="/coach/drafts" className="text-orange-400">Coach drafts</Link><Link href="/coach/feedback" className="text-orange-400">Coach feedback notes</Link><Link href="/admin/audit" className="text-orange-400">Audit history</Link></div>
        <h1 className="text-2xl font-bold text-red-400">Access Denied</h1>
        <p className="mt-2 text-zinc-400">
          You need admin privileges to access this page.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-orange-400 hover:underline"
        >
          ← Back home
        </Link>
      </div>
    );
  }

  // Fetch existing plans for quick links
  const { data: plans } = await supabase
    .from("training_plans")
    .select("id, title, duration_weeks, is_published")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-3xl font-bold">Admin</h1>
        <p className="mt-1 text-zinc-400">
          Post WODs, manage exercises, and build training plans
        </p>
      </div>

      <nav className="flex flex-wrap gap-3">
        {[
          ["feedback", "Feedback reports"],
          ["errors", "Application errors"],
          ["users", "Registrations & email list"],
        ].map(([path, label]) => (
          <Link
            key={path}
            href={`/admin/${path}`}
            className="rounded-lg border border-orange-800 px-4 py-3 text-orange-400"
          >
            {label}
          </Link>
        ))}
      </nav>
      {/* Quick links to plans */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Training Plans</h2>
          <Link
            href="/admin/plans"
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 transition"
          >
            + Create / Edit Plans
          </Link>
        </div>
        {plans && plans.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {plans.map((p) => (
              <Link
                key={p.id}
                href={`/admin/plans?edit=${p.id}`}
                className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 hover:border-zinc-700 transition"
              >
                <span className="font-medium text-orange-400">{p.title}</span>
                <span className="ml-2 text-xs text-zinc-500">
                  {p.duration_weeks}w · {p.is_published ? "Published" : "Draft"}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            No plans yet. Create your first one.
          </p>
        )}
      </section>

      <AdminWodManager />

      <WodImportPanel />

      <section>
        <h2 className="text-xl font-semibold mb-4">
          Add Exercise (with how-to video)
        </h2>
        <AdminExerciseForm />
      </section>
    </div>
  );
}
