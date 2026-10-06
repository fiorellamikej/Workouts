"use client";
import { useEffect } from "react";
import { faqCategories } from "@/lib/faq";
export function FaqAccordion() {
  useEffect(() => {
    const reveal = () => {
      const target = document.getElementById(window.location.hash.slice(1));
      if (!(target instanceof HTMLDetailsElement)) return;
      target.open = true;
      const category = target.parentElement?.closest("details");
      if (category) category.open = true;
      target.scrollIntoView?.({ block: "nearest" });
    };
    reveal(); window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);
  return <div className="space-y-3">{faqCategories.map(category => <details key={category.id} id={category.id} className="rounded-xl border border-zinc-700 bg-zinc-900/50"><summary className="cursor-pointer p-4 text-lg font-semibold focus-visible:outline-orange-400">{category.title}</summary><div className="space-y-2 px-4 pb-4">{category.questions.map(item => <details key={item.id} id={item.id} className="rounded-lg border border-zinc-800"><summary className="cursor-pointer p-3 font-medium focus-visible:outline-orange-400">{item.question}</summary><p className="px-3 pb-4 leading-relaxed text-zinc-300">{item.answer}</p></details>)}</div></details>)}</div>;
}
