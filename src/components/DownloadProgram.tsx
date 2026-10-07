'use client';
import { useState } from 'react';
import { putLocal, setOfflineUser } from '@/lib/offline-store';
import type { OfflinePack } from '@/lib/offline-pack';
export function DownloadProgram({ planId }: { planId: string }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function download() {
    setBusy(true); setMessage('');
    try {
      if (!('serviceWorker' in navigator)) throw new Error('Offline downloads are unavailable in this browser.');
      await navigator.serviceWorker.register('/workout-sw.js', { scope: '/' }); await navigator.serviceWorker.ready;
      const response = await fetch(`/api/offline/program?id=${encodeURIComponent(planId)}`, { cache: 'no-store' });
      const pack = await response.json(); if (!response.ok) throw new Error(pack.error);
      await putLocal('packs', pack as OfflinePack); await setOfflineUser(pack.userId);
      const persistent = navigator.storage?.persist ? await navigator.storage.persist() : false;
      const size = new TextEncoder().encode(JSON.stringify(pack)).length;
      setMessage(`Available offline: ${(size / 1024).toFixed(0)} KB of program data, plus the small app shell. Videos require internet.${persistent ? '' : ' Browser storage is best effort; test airplane mode before relying on it.'}`);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Download failed. Retry while connected.'); }
    finally { setBusy(false); }
  }
  return <section className="ss-panel space-y-3"><button type="button" className="ss-secondary text-amber-200" disabled={busy} onClick={download}>{busy ? 'Downloading...' : 'Make program available offline'}</button><a className="ml-3 text-amber-200 underline" href="/offline.html">Open offline programs</a><p className="text-sm text-zinc-200">Downloads this program, instructions, PR baselines, and recent history. No videos. Download again after program changes; unsynced workouts are kept separately.</p>{message && <p role="status" className="text-sm text-amber-200">{message}</p>}</section>;
}
