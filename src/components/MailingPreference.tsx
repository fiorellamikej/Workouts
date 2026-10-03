"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
export function MailingPreference({
  initial,
  error,
}: {
  initial: boolean;
  error: boolean;
}) {
  const [optIn, setOptIn] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section className="space-y-3 rounded-xl border border-zinc-800 p-5">
      <h2 className="text-lg font-semibold">Email updates</h2>
      {error ? (
        <p role="alert" className="text-red-400">
          Could not load your preference. Reload before making changes.
        </p>
      ) : (
        <>
          <label className="flex gap-3 items-start">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={optIn}
              disabled={busy}
              onChange={(e) => {
                setOptIn(e.target.checked);
                setMessage("");
              }}
            />
            Send me occasional Sword and Shield news and training updates.
          </label>
          <button
            disabled={busy}
            className="min-h-11 rounded bg-orange-600 px-4 py-2 disabled:opacity-50"
            onClick={async () => {
              setBusy(true);
              setMessage("");
              try {
                const { error } = await createClient().rpc(
                  "set_mailing_preference",
                  { p_opt_in: optIn },
                );
                if (error) throw error;
                setMessage("Preference saved.");
              } catch {
                setMessage("Could not save. Please try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Save email preference"}
          </button>
          <p role="status" className="text-sm">
            {message}
          </p>
        </>
      )}
      <p className="text-sm text-zinc-400">
        You can turn this off anytime. Account and password-reset emails are
        separate.
      </p>
    </section>
  );
}
