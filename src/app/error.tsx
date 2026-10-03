"use client";
import { useEffect } from "react";
import Link from "next/link";
import { reportAppError } from "@/lib/report-error";
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void reportAppError(error, "boundary");
  }, [error]);
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p>
        Please reload and check your latest saved result before retrying a save.
      </p>
      {error.digest && (
        <p className="text-sm text-zinc-400">Reference: {error.digest}</p>
      )}
      <button onClick={reset} className="rounded bg-orange-600 px-4 py-3">
        Try again
      </button>
      <Link href="/feedback" className="ml-4 text-orange-400">
        Report a problem
      </Link>
    </section>
  );
}
