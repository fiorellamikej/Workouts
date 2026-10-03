"use client";
import { useRef, useState } from "react";
export function PlanExportButton({ planId }: { planId: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        className="min-h-11 rounded-lg border border-orange-800 px-4 py-2 text-sm text-orange-400 hover:bg-orange-950/30 disabled:opacity-50"
        onClick={async () => {
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setError("");
          let url: string | null = null;
          try {
            const response = await fetch(
              `/api/admin/plans/${encodeURIComponent(planId)}/export`,
              { cache: "no-store" },
            );
            if (!response.ok) {
              const body = await response.json().catch(() => null);
              throw new Error(body?.error || "Could not export. Please retry.");
            }
            const blob = await response.blob();
            const filename =
              response.headers
                .get("Content-Disposition")
                ?.match(/filename="([a-zA-Z0-9-]+\.json)"/)?.[1] ||
              "training-plan.json";
            url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            // Let the browser start its download before releasing the object URL.
            const downloadUrl = url;
            setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
            url = null;
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Could not export. Please retry.",
            );
          } finally {
            if (url) URL.revokeObjectURL(url);
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        {busy ? "Preparing download…" : "Export saved plan (.json)"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
