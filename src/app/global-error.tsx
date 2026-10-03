"use client";
import { useEffect } from "react";
import { reportAppError } from "@/lib/report-error";
export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          background: "#09090b",
          color: "#fff",
          padding: 32,
          fontFamily: "sans-serif",
        }}
      >
        <h1>Something went wrong</h1>
        <p>Reload and check your latest saved result before trying again.</p>
        {error.digest && <p>Reference: {error.digest}</p>}
        <button onClick={reset}>Try again</button>
        <p>
          <a href="/feedback">Report a problem</a>
        </p>
      </body>
    </html>
  );
}
