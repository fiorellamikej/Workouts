import { FaqAccordion } from "@/components/FaqAccordion";
export const metadata = { title: "FAQ | Sword and Shield" };
export default function FaqPage() {
  return <div className="mx-auto max-w-3xl space-y-6"><h1 className="text-3xl font-bold">Frequently asked questions</h1><p className="text-zinc-400">Choose a category, then a question.</p><FaqAccordion /></div>;
}
