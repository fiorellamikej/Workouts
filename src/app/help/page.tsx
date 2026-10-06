import Link from "next/link";

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <Link href="/dashboard" className="text-orange-400">← Todays WOD</Link>
      <h1 className="text-3xl font-bold">Get Help</h1>
      <div className="flex flex-wrap gap-3">
        <Link href="/faq" className="min-h-11 rounded-lg border border-zinc-700 px-4 py-3 text-orange-400">Frequently asked questions</Link>
        <Link href="/exercises" className="min-h-11 rounded-lg border border-zinc-700 px-4 py-3 text-orange-400">Exercise library</Link>
        <Link href="/feedback" className="min-h-11 rounded-lg border border-zinc-700 px-4 py-3 text-orange-400">Report a bug or suggestion</Link>
      </div>
      <p className="text-sm text-zinc-400">Choose a category in the FAQ for account, workout, and installation help.</p>
    </div>
  );
}
