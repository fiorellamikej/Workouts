"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { FeedbackReport, ErrorEvent } from "@/lib/support";
export function AdminSupportQueue({
  reports,
  errors,
}: {
  reports?: FeedbackReport[];
  errors?: ErrorEvent[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState("active"),
    [busy, setBusy] = useState<string | null>(null),
    [message, setMessage] = useState("");
  const update = async (id: string, status: string) => {
    if (busy) return;
    setBusy(id);
    setMessage("");
    try {
      const { error } = await createClient().rpc(
        reports ? "triage_feedback" : "resolve_app_error",
        reports
          ? { p_id: id, p_status: status }
          : { p_id: id, p_resolved: status === "resolved" },
      );
      if (error) throw error;
      router.refresh();
    } catch {
      setMessage("Could not update status. Please retry.");
    } finally {
      setBusy(null);
    }
  };
  const rows = reports
    ? reports.filter(
        (r) =>
          filter === "all" ||
          (filter === "active"
            ? !["resolved", "dismissed"].includes(r.status)
            : r.status === filter),
      )
    : (errors || []).filter(
        (r) =>
          filter === "all" ||
          (filter === "active" ? !r.resolved_at : !!r.resolved_at),
      );
  return (
    <div className="space-y-4">
      <label className="block">
        Filter
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="ml-3 rounded border border-zinc-700 bg-zinc-900 p-3"
        >
          <option value="active">Active</option>
          <option value="all">All</option>
          {reports && (
            <>
              <option value="open">Open</option>
              <option value="in_review">In review</option>
              <option value="dismissed">Dismissed</option>
            </>
          )}
          <option value="resolved">Resolved</option>
        </select>
      </label>
      {message && (
        <p role="alert" className="text-red-400">
          {message}
        </p>
      )}
      {!rows.length && (
        <p className="text-zinc-400">No matching entries in this page.</p>
      )}
      {rows.map((row) => (
        <article
          key={row.id}
          className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
        >
          {"title" in row ? (
            <>
              <h2 className="text-lg font-semibold">{row.title}</h2>
              <p className="text-sm text-orange-400">
                {row.kind} · {row.status.replace("_", " ")}
              </p>
              <p className="whitespace-pre-wrap break-words">
                {row.description}
              </p>
              <label>
                Status
                <select
                  disabled={!!busy}
                  className="ml-3 rounded border border-zinc-700 bg-zinc-950 p-3"
                  value={row.status}
                  onChange={(e) => void update(row.id, e.target.value)}
                >
                  {["open", "in_review", "resolved", "dismissed"].map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <>
              <h2 className="font-semibold">
                {row.error_code} · {row.source}
              </h2>
              <p className="text-sm">
                Reference: {row.digest || "No server digest"} ·{" "}
                {row.resolved_at ? "Resolved" : "Open"}
              </p>
              <button
                disabled={!!busy}
                onClick={() =>
                  void update(row.id, row.resolved_at ? "open" : "resolved")
                }
                className="min-h-11 rounded border border-orange-700 px-4 py-2 disabled:opacity-50"
              >
                {row.resolved_at ? "Reopen" : "Mark resolved"}
              </button>
            </>
          )}
          <p className="text-xs text-zinc-400 break-all">
            {row.page_path} · {new Date(row.created_at).toISOString()}
            <br />
            User: {row.user_id}
            <br />
            Entry: {row.id}
          </p>
        </article>
      ))}
    </div>
  );
}
