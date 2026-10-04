"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { AccountAccessNotice } from "@/components/AccountAccessNotice";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("error") ===
      "confirmation"
    )
      setError(
        "This confirmation link is invalid or expired. Try logging in, or contact the admin for help confirming your account.",
      );
  }, []);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting.current) return;
    // Read the actual inputs, including values filled by a password manager.
    const fields = new FormData(e.currentTarget);
    const email = String(fields.get("email") || "").trim();
    const password = String(fields.get("password") || "");
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    submitting.current = true;
    let navigating = false;
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setError(error.message);
        return;
      }
      // A fresh navigation reads the newly written session cookies and avoids
      // both the intro screen and previously cached signed-out page content.
      const next = new URLSearchParams(window.location.search).get("next");
      // Hero detail pages may return athletes directly to the workout they opened.
      // Only this local route pattern is accepted; ordinary logins go home.
      window.location.replace(
        next && /^\/heroes\/[a-z0-9-]+$/.test(next) ? next : "/dashboard",
      );
      navigating = true;
    } catch {
      setError("Could not log in. Check your connection and try again.");
    } finally {
      if (!navigating) {
        submitting.current = false;
        setLoading(false);
      }
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold mb-6">Log in</h1>
      <form
        id="login-form"
        method="post"
        autoComplete="on"
        onSubmit={handleLogin}
        className="space-y-4"
      >
        <div>
          <label
            htmlFor="login-email"
            className="block text-sm font-medium text-zinc-300 mb-1"
          >
            Email
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="email"
            required
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="current-password"
            className="block text-sm font-medium text-zinc-300 mb-1"
          >
            Password
          </label>
          <input
            id="current-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-orange-600 px-4 py-2.5 font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition"
        >
          {loading ? "Logging in..." : "Log in"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link
          href="/auth/forgot-password"
          className="text-orange-400 hover:underline"
        >
          Forgot password?
        </Link>
      </p>
      <p className="mt-4 text-center text-sm text-zinc-400">
        No account?{" "}
        <Link href="/auth/signup" className="text-orange-400 hover:underline">
          Sign up
        </Link>
      </p>
      <AccountAccessNotice />
    </div>
  );
}
