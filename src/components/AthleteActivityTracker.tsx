"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { betaPagePath } from "@/lib/beta-activity";
export function AthleteActivityTracker() {
  const pathname = usePathname();
  useEffect(() => {
    const db = createClient();
    let busy = false;
    let betaBusy = false;
    let stopped = false;
    let lastBetaPing = 0;
    let pageRecorded = false;
    const page = betaPagePath(pathname);
    async function beta(pageView = false) {
      if (stopped || !page || betaBusy || document.visibilityState !== "visible") return;
      if (!pageView && Date.now() - lastBetaPing < 60_000) return;
      betaBusy = true;
      try {
        const { data: { user } } = await db.auth.getUser();
        if (!user || stopped) return;
        const { error } = await db.rpc("record_beta_activity", {
          p_page_path: page,
          p_page_view: pageView,
          p_event_id: crypto.randomUUID(),
        });
        if (!error) {
          lastBetaPing = Date.now();
          if (pageView) pageRecorded = true;
        }
      } catch {
        // Analytics must never interrupt a workout or expose entered data.
      } finally { betaBusy = false; }
    }
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
    void beta(true);
    const interval = setInterval(
      () => {
        void record();
      },
      5 * 60 * 1000,
    );
    const visible = () => {
      void record();
      void beta(!pageRecorded);
    };
    const interaction = (event: Event) => {
      if (event.isTrusted) void beta(!pageRecorded);
    };
    for (const event of ["pointerdown", "keydown", "scroll"])
      window.addEventListener(event, interaction, { passive: true });
    document.addEventListener("visibilitychange", visible);
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange(() => {
      setTimeout(() => {
        void record();
        void beta(!pageRecorded);
      }, 0);
    });
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      subscription.unsubscribe();
      for (const event of ["pointerdown", "keydown", "scroll"])
        window.removeEventListener(event, interaction);
    };
  }, [pathname]);
  return null;
}
