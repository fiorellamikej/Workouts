"use client";
import { useEffect } from "react";
import { reportAppError } from "@/lib/report-error";
export function AppErrorTracker() {
  useEffect(() => {
    const error = (event: ErrorEvent) => {
      void reportAppError(event.error, "window");
    };
    const promise = (event: PromiseRejectionEvent) => {
      void reportAppError(event.reason, "promise");
    };
    window.addEventListener("error", error);
    window.addEventListener("unhandledrejection", promise);
    return () => {
      window.removeEventListener("error", error);
      window.removeEventListener("unhandledrejection", promise);
    };
  }, []);
  return null;
}
