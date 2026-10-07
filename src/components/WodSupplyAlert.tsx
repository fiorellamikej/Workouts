'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
type Status = { today: string; first_day: string | null; last_day: string | null; first_gap: string | null; days_left: number; warning: boolean };
export function WodSupplyAlert({ revision = 0 }: { revision?: number }) {
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = async () => { const { data, error } = await createClient().rpc('wod_schedule_status'); if (active) { setStatus(data); setError(error ? 'Could not check WOD supply. Check the migration and MFA session.' : ''); } };
    void refresh(); const interval = setInterval(refresh, 60000); window.addEventListener('focus', refresh);
    return () => { active = false; clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [revision]);
  return <section className={`ss-panel space-y-2 ${status?.warning ? 'border-amber-400' : ''}`} aria-label="WOD schedule supply"><h2 className="ss-label">WOD schedule supply</h2>{error ? <p role="alert" className="text-red-300">{error}</p> : !status ? <p>Checking schedule...</p> : <div role={status.warning ? 'alert' : 'status'} className="text-zinc-200">{!status.last_day ? <p className="text-amber-200">No visible WODs are scheduled today or later. Add the next block.</p> : <><p className={status.warning ? 'text-amber-200' : ''}>Scheduled through {status.last_day}.{status.warning && ' Supply is within five days of ending, or a near-term gap needs attention.'}</p>{status.first_gap && <p>First uncovered date inside the schedule: {status.first_gap}.</p>}{status.first_day && status.first_day > status.today && <p>Next scheduled WOD: {status.first_day}.</p>}<p className="text-sm">Hidden WODs do not count as scheduled coverage.</p></>}</div>}</section>;
}
