import { PHASES, phaseProgress, type WodPhase } from "@/lib/daily-wod";
export function WodPhaseGuide({ phase, date }: { phase: WodPhase | null; date: string }) {
  const progress = phase ? phaseProgress(phase, date) : null;
  return (
    <section aria-label="Daily WOD programming" className="space-y-4 rounded-xl border border-orange-700/50 bg-orange-950/20 p-5">
      {phase && progress && progress.day >= 1 && progress.day <= progress.total ? (
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-orange-400">Current programming phase</p>
          <h2 className="mt-1 text-xl font-semibold">{PHASES[phase.phase_key].label}: Day {progress.day} of {progress.total}</h2>
          <p className="mt-2 text-sm text-zinc-300">{PHASES[phase.phase_key].description}</p>
          <p className="mt-2 text-xs text-zinc-400">Calendar days include recovery and rest days. The shared Daily WOD changes at midnight Eastern Time.</p>
        </div>
      ) : <h2 className="text-lg font-semibold">How our Daily WOD programming works</h2>}
      <details>
        <summary className="cursor-pointer font-medium text-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400">About the training phases</summary>
        <p className="mt-3 text-sm text-zinc-300">Sword and Shield follows CrossFit-style principles: varied movements, strength and skill practice, and conditioning across different durations and intensities. Our programming uses the phases below. These are our phase lengths, rather than a universal CrossFit calendar.</p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {Object.entries(PHASES).map(([key, value]) => <div key={key}><dt className="font-medium text-zinc-100">{value.label} ({key === "deload" ? "1–2 weeks" : "8 weeks"})</dt><dd className="mt-1 text-sm text-zinc-300">{value.description}</dd></div>)}
        </dl>
      </details>
    </section>
  );
}
