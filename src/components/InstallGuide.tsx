import Link from "next/link";
export function InstallGuide() {
  return <section className="mt-6 space-y-2 rounded-xl border border-zinc-700 p-4"><h2 className="font-semibold">Add Sword and Shield to your home screen</h2><p className="text-sm text-zinc-300"><strong>iPhone:</strong> Open in Safari → Share → Add to Home Screen → Add. Enable Open as Web App if shown.</p><p className="text-sm text-zinc-300"><strong>Android:</strong> Open in Chrome → three-dot menu → Add to home screen or Install app.</p><p className="text-sm text-zinc-400">Also available in your phone or computer browser. Saved progress syncs with your account.</p><Link href="/faq#install" className="inline-block py-2 text-orange-400 hover:underline">Installation help and FAQ →</Link></section>;
}
