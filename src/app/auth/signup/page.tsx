"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { AccountAccessNotice } from "@/components/AccountAccessNotice";

export default function SignupPage() {
  const [mailingOptIn, setMailingOptIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const supabase = createClient();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            display_name: displayName.trim(),
            mailing_opt_in: mailingOptIn,
          },
        },
      });
      if (error) {
        setError(error.message);
        return;
      }
      setPassword("");
      if (data.session) window.location.assign("/dashboard");
      else
        setMessage(
          "Check your email for a confirmation link, then log in. If you already have an account, use Log in or Forgot password.",
        );
    } catch {
      setError(
        "Could not create your account. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold mb-6">Create account</h1>
      <form
        id="signup-form"
        autoComplete="on"
        onSubmit={handleSignup}
        className="space-y-4"
      >
        <div>
          <label
            htmlFor="signup-display-name"
            className="block text-sm font-medium text-zinc-300 mb-1"
          >
            Display Name
          </label>
          <input
            id="signup-display-name"
            name="display_name"
            type="text"
            autoComplete="nickname"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={100}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
            placeholder="How others will see you"
          />
        </div>
        <div>
          <label
            htmlFor="signup-email"
            className="block text-sm font-medium text-zinc-300 mb-1"
          >
            Email
          </label>
          <input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="new-password"
            className="block text-sm font-medium text-zinc-300 mb-1"
          >
            Password
          </label>
          <input
            id="new-password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
          />
        </div>
        <label className="flex items-start gap-3 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={mailingOptIn}
            onChange={(e) => setMailingOptIn(e.target.checked)}
            className="mt-1 h-5 w-5"
          />
          Send me occasional Sword and Shield news and training updates.
          Optional; change this anytime in your profile.
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {message && <p className="text-sm text-green-400">{message}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-orange-600 px-4 py-2.5 font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition"
        >
          {loading ? "Creating account..." : "Sign up"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-zinc-400">
        Already have an account?{" "}
        <Link href="/auth/login" className="text-orange-400 hover:underline">
          Log in
        </Link>
      </p>
      <AccountAccessNotice />
    </div>
  );
}
