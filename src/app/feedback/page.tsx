import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { FeedbackForm } from "@/components/FeedbackForm";
import type { FeedbackReport } from "@/lib/support";
export default async function FeedbackPage() {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/auth/login");
  const { data, error } = await client
    .from("feedback_reports")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<FeedbackReport[]>();
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Feedback &amp; bug reports</h1>
      <FeedbackForm />
      <h2 className="text-xl font-semibold">Your latest reports</h2>
      {error ? (
        <p role="alert" className="text-red-400">
          Could not load reports. Please reload or contact the admin.
        </p>
      ) : !data?.length ? (
        <p className="text-zinc-400">No reports yet.</p>
      ) : (
        data.map((r) => (
          <article
            key={r.id}
            className="space-y-2 rounded-xl border border-zinc-800 p-4"
          >
            <h3 className="font-semibold">{r.title}</h3>
            <p className="text-sm text-orange-400">
              {r.kind} · {r.status.replace("_", " ")} ·{" "}
              {new Date(r.created_at).toLocaleDateString("en-US", {
                timeZone: "UTC",
              })}
            </p>
            <p className="whitespace-pre-wrap break-words">{r.description}</p>
            <p className="text-xs text-zinc-400 break-all">
              {r.page_path} · {r.id}
            </p>
          </article>
        ))
      )}
    </div>
  );
}
