"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safePagePath } from "@/lib/support";
import { reportAppError } from "@/lib/report-error";
export function FeedbackForm() {
  const [kind, setKind] = useState("bug"),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [path, setPath] = useState("/");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState("");
  const lock = useRef(false);
  const router = useRouter();
  const field = "mt-1 w-full rounded border border-zinc-700 bg-zinc-900 p-3";
  return (
    <form
      className="space-y-4 rounded-xl border border-zinc-800 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setError("");
        setSaved("");
        try {
          const { data, error } = await createClient().rpc("submit_feedback", {
            p_kind: kind,
            p_title: title.trim(),
            p_description: description.trim(),
            p_page_path: safePagePath(path),
          });
          if (error) throw error;
          setSaved(`Report submitted. Reference: ${data}`);
          setTitle("");
          setDescription("");
          router.refresh();
        } catch (e) {
          setError(
            e && typeof e === "object" && "message" in e
              ? String(e.message)
              : "Could not submit. Please try again.",
          );
          void reportAppError(e);
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      <label className="block">
        Type
        <select
          className={field}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          disabled={busy}
        >
          <option value="bug">Bug / problem</option>
          <option value="suggestion">Suggestion</option>
        </select>
      </label>
      <label className="block">
        Title
        <input
          className={field}
          required
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
        />
      </label>
      <label className="block">
        What happened, and what did you expect?
        <textarea
          className={field}
          rows={5}
          required
          maxLength={4000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
        />
      </label>
      <label className="block">
        Page path (optional)
        <input
          className={field}
          maxLength={200}
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/plans"
          disabled={busy}
        />
      </label>
      <p className="text-sm text-zinc-400">
        Please leave out passwords and private account details. Only you and the
        admin can read your report.
      </p>
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="break-all text-green-400">
          {saved}
        </p>
      )}
      <button
        disabled={busy || !title.trim() || !description.trim()}
        className="min-h-11 rounded bg-orange-600 px-5 py-3 disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Submit report"}
      </button>
    </form>
  );
}
