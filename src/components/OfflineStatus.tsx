'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { allLocal, offlineUser, setOfflineUser, syncQueue } from '@/lib/offline-store';
export function OfflineStatus() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/workout-sw.js', { scope: '/' }).catch(() => { if (active) setMessage('Offline app shell could not install. Reconnect and retry before leaving service.'); });
    const check = async () => {
      try {
        if (!navigator.onLine) { if (active) setMessage('Offline. Open downloaded programs to keep training.'); return; }
        const { data: { user } } = await createClient().auth.getUser();
        if (!active) return;
        if (!user) { await setOfflineUser(null); return; }
        if (await offlineUser() !== user.id) await setOfflineUser(user.id);
        const pending = (await allLocal('queue')).filter(r => r.userId === user.id);
        if (!pending.length) { setMessage(''); return; }
        setMessage(`Syncing ${pending.length} saved workout action(s)...`);
        const receipts = await syncQueue(user.id);
        if (active) setMessage(receipts.flatMap(r => r.data.prs || []).length ? 'Workouts synced. New one-rep PRs are saved in your profile.' : 'Workouts synced.');
      } catch (e) { if (active) setMessage(e instanceof Error ? e.message : 'Sync unavailable. Local workouts are preserved.'); }
    };
    const subscription = createClient().auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') void setOfflineUser(null); });
    void check(); window.addEventListener('online', check); window.addEventListener('offline', check);
    return () => { active = false; subscription.data.subscription.unsubscribe(); window.removeEventListener('online', check); window.removeEventListener('offline', check); };
  }, []);
  return message ? <p role="status" className="mx-auto max-w-5xl px-4 py-2 text-sm text-amber-200">{message} <a href="/offline.html" className="underline">Offline programs and sync queue</a></p> : null;
}
