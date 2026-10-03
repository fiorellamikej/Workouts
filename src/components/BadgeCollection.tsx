"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import { BADGES, type BadgeSummary } from "@/lib/badges";
export function BadgeCollection({
  summary: initial,
}: {
  summary: BadgeSummary;
}) {
  const [summary, setSummary] = useState(initial);
  useEffect(() => {
    setSummary(initial);
  }, [initial]);
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const { data, error } = await createClient().rpc("my_badge_summary");
        if (!cancelled && !error && data) setSummary(data as BadgeSummary);
      } catch {}
    }
    window.addEventListener("athlete-activity-recorded", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("athlete-activity-recorded", refresh);
    };
  }, []);
  const earned = new Map(summary.badges.map((b) => [b.badge_key, b]));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-orange-900 bg-orange-950/20 p-4">
          <p className="text-3xl font-bold text-orange-400">
            {earned.size}/{BADGES.length}
          </p>
          <p className="text-sm text-zinc-400">Badges earned</p>
        </div>
        <div className="rounded-xl border border-zinc-800 p-4">
          <p className="text-3xl font-bold">{summary.checkin_streak}</p>
          <p className="text-sm text-zinc-400">Check-ins in current streak</p>
          <p className="text-xs text-zinc-500">
            Across {summary.calendar_span} calendar days
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 p-4">
          <p className="text-3xl font-bold">{summary.completed_workouts}</p>
          <p className="text-sm text-zinc-400">Saved workout completions</p>
        </div>
      </div>
      <p className="text-sm text-zinc-400">
        Rest days protect your streak automatically. Check-ins count once per
        local date; opening the app while signed in is enough. Badges use your
        saved timezone: {summary.timezone}.
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {BADGES.map((b) => {
          const award = earned.get(b.key);
          return (
            <article
              key={b.key}
              className={`flex flex-col items-center rounded-2xl border p-4 text-center ${award ? "border-orange-800/60 bg-gradient-to-b from-orange-950/30 to-zinc-900" : "border-zinc-800 bg-zinc-900/40"}`}
            >
              <Image
                src={`/badges/${b.key}.svg`}
                width={96}
                height={112}
                alt=""
                unoptimized
                className={award ? "" : "opacity-35 grayscale"}
              />
              <h2
                className={`mt-2 font-semibold ${award ? "text-orange-100" : "text-zinc-400"}`}
              >
                {b.title}
              </h2>
              <p className="mt-2 text-xs text-zinc-400">{b.description}</p>
              <p
                className={`mt-3 text-xs ${award ? "text-orange-300" : "text-zinc-500"}`}
              >
                {award
                  ? `Earned ${new Date(award.earned_at).toLocaleDateString("en-US", { timeZone: summary.timezone })}${b.key === "anniversary" ? ` · Year ${award.level}` : ""}`
                  : "Locked"}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
