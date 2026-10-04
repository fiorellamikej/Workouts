import { HeroLibrary } from "@/components/HeroLibrary";
export default function HeroesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Hero WODs</h1>
        <p className="mt-2 text-zinc-400">
          Honor their service. Train with purpose. Return to a benchmark and
          track your own progress.
        </p>
      </div>
      <HeroLibrary />
    </div>
  );
}
