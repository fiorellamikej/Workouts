"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("error") ===
      "confirmation"
    )
      setError(
        "This confirmation link is invalid or expired. Try logging in, or contact the admin for help confirming your account.",
      );
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
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
      router.push("/");
      router.refresh();
    } catch {
      setError("Could not log in. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold mb-6">Log in</h1>
      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
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
    </div>
  );
}
