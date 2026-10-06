"use client";
import { useState, useRef, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
type Action = "email" | "password" | "delete";
export function AccountSettings({ userId, email }: { userId: string; email: string }) {
  const [client] = useState(() => createClient());
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>, action: Action) {
    event.preventDefault(); if (lock.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const currentPassword = String(values.get("currentPassword") || "");
    const newEmail = String(values.get("email") || "").trim();
    const password = String(values.get("password") || "");
    setError(""); setMessage("");
    if (action === "password" && (password.length < 8 || password !== values.get("confirmPassword"))) {
      setError("Use at least 8 characters and make sure the new passwords match."); return;
    }
    if (action === "email" && newEmail.toLowerCase() === email.toLowerCase()) {
      setError("Enter a different email address."); return;
    }
    lock.current = true; setBusy(true);
    try {
      if (action === "delete") {
        const response = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, confirmation: values.get("confirmation") }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not delete your account.");
        await client.auth.signOut({ scope: "local" });
        window.location.replace("/auth/login?deleted=1"); return;
      }
      const verified = await client.auth.signInWithPassword({ email, password: currentPassword });
      if (verified.error || verified.data.user?.id !== userId) throw new Error("Your current password could not be verified.");
      const result = action === "email"
        ? await client.auth.updateUser({ email: newEmail }, { emailRedirectTo: `${window.location.origin}/auth/callback?next=/profile/account` })
        : await client.auth.updateUser({ password });
      if (result.error) throw new Error(result.error.message);
      form.reset();
      if (action === "password") {
        await client.auth.signOut({ scope: "local" });
        window.location.replace("/auth/login?passwordChanged=1"); return;
      }
      setMessage("Email change requested. Follow the confirmation messages sent to your old and new addresses. Your current email remains active until confirmation is complete.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Check your connection and try again."); }
    finally { lock.current = false; setBusy(false); }
  }
  const inputClass = "mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2";
  function currentPassword(id: string) { return <label className="block">Current password<input id={id} name="currentPassword" type="password" autoComplete="current-password" required className={inputClass} /></label>; }
  return <div className="space-y-6"><p className="text-zinc-400">Current email: {email}. If you followed an email confirmation link, this shows the address currently active on your account.</p>{error && <p role="alert" className="text-red-400">{error}</p>}{message && <p role="status" className="text-green-400">{message}</p>}
    <form onSubmit={e => submit(e, "email")} className="space-y-3 rounded-xl border border-zinc-700 p-4"><h2 className="text-xl font-semibold">Change email</h2><fieldset disabled={busy} className="space-y-3">{currentPassword("email-current-password")}<label className="block">New email<input name="email" type="email" autoComplete="email" required className={inputClass} /></label><button className="rounded-lg bg-orange-600 px-4 py-2">Request email change</button></fieldset></form>
    <form onSubmit={e => submit(e, "password")} className="space-y-3 rounded-xl border border-zinc-700 p-4"><h2 className="text-xl font-semibold">Change password</h2><fieldset disabled={busy} className="space-y-3">{currentPassword("password-current-password")}<label className="block">New password<input name="password" type="password" autoComplete="new-password" minLength={8} required className={inputClass} /></label><label className="block">Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required className={inputClass} /></label><p className="text-sm text-zinc-400">You will sign in again with your new password.</p><button className="rounded-lg bg-orange-600 px-4 py-2">Change password</button></fieldset></form>
    <details className="rounded-xl border border-red-900 p-4"><summary className="cursor-pointer font-semibold text-red-400">Delete account permanently</summary><form onSubmit={e => submit(e, "delete")} className="mt-4 space-y-3"><p>Your account, profile, PRs, enrollments, results, exercise logs, badges, feedback, and beta activity will be permanently deleted. Shared programs and workouts remain. Provider logs and backups may remain under their retention policies. This cannot be undone.</p><fieldset disabled={busy} className="space-y-3">{currentPassword("delete-current-password")}<label className="block">Type DELETE to confirm<input name="confirmation" required pattern="DELETE" autoComplete="off" className={inputClass} /></label><button className="rounded-lg bg-red-700 px-4 py-2">{busy ? "Working..." : "Permanently delete my account"}</button></fieldset></form></details>
  </div>;
}
