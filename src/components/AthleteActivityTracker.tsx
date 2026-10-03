"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
export function AthleteActivityTracker() {
  const pathname = usePathname();
  useEffect(() => {
    const db = createClient();
    let busy = false;
    async function record() {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const {
          data: { user },
        } = await db.auth.getUser();
        if (user) {
          const timezone =
            Intl.DateTimeFormat().resolvedOptions().timeZone ||
            "America/New_York";
          const { error } = await db.rpc("record_athlete_activity", {
            p_timezone: timezone,
          });
          if (error) console.warn("Activity tracking unavailable:", error.code);
          else window.dispatchEvent(new Event("athlete-activity-recorded"));
        }
      } catch {
        console.warn("Activity tracking temporarily unavailable.");
      } finally {
        busy = false;
      }
    }
    void record();
    const interval = setInterval(
      () => {
        void record();
      },
      5 * 60 * 1000,
    );
    const visible = () => {
      void record();
    };
    document.addEventListener("visibilitychange", visible);
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange(() => {
      setTimeout(() => {
        void record();
      }, 0);
    });
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      subscription.unsubscribe();
    };
  }, [pathname]);
  return null;
}
