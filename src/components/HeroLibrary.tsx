"use client";
import { useState } from "react";
import Link from "next/link";
import { HERO_WORKOUTS } from "@/lib/heroes";

export function HeroLibrary() {
  const [query, setQuery] = useState(""),
    [score, setScore] = useState(""),
    [equipment, setEquipment] = useState("");
  const options = [
    ...new Set(HERO_WORKOUTS.flatMap((w) => w.equipment)),
  ].sort();
  const matches = HERO_WORKOUTS.filter(
    (w) =>
      (!score || w.score_type === score) &&
      (!equipment || w.equipment.includes(equipment)) &&
      `${w.name} ${w.honoree} ${w.instructions.join(" ")} ${w.equipment.join(" ")}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const field = "w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2";
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          Search workouts
          <input
            className={field}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, movement or honoree"
          />
        </label>
        <label>
          Scoring
          <select
            className={field}
            value={score}
            onChange={(e) => setScore(e.target.value)}
          >
            <option value="">All scoring</option>
            <option value="for_time">For time</option>
            <option value="amrap">AMRAP</option>
          </select>
        </label>
        <label>
          Includes equipment
          <select
            className={field}
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
          >
            <option value="">Any equipment</option>
            {options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-sm text-zinc-400">
        {matches.length} of {HERO_WORKOUTS.length} workouts
      </p>
      {!matches.length && (
        <p>No matching workouts. Change or clear the filters.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {matches.map((w) => (
          <Link
            key={w.slug}
            href={`/heroes/${w.slug}`}
            className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 hover:border-orange-700"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <h2 className="text-xl font-semibold text-orange-400">
                {w.name}
              </h2>
              <span className="text-sm text-zinc-400">
                {w.score_type === "amrap"
                  ? `${w.minutes}-minute AMRAP`
                  : "For time"}
              </span>
            </div>
            <p className="text-sm">In honor of {w.honoree}</p>
            <p className="text-sm text-zinc-400">{w.instructions[0]}</p>
            <p className="text-xs text-zinc-400">
              Equipment: {w.equipment.join(" · ")}
            </p>
            <p className="text-sm text-orange-300">
              View workout and log a score →
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
