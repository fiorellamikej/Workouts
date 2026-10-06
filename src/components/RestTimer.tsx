'use client'
import { useEffect, useRef, useState } from 'react'
import { timeText } from '@/lib/training'
export function RestTimer() {
  const [duration, setDuration] = useState(120), [remaining, setRemaining] = useState(120), [running, setRunning] = useState(false)
  const end = useRef(0)
  useEffect(() => {
    if (!running) return
    const tick = () => { const next = Math.max(0, Math.ceil((end.current - Date.now()) / 1000)); setRemaining(next); if (!next) setRunning(false) }
    tick(); const timer = setInterval(tick, 250); return () => clearInterval(timer)
  }, [running])
  return <section className="ss-panel space-y-3"><div className="flex items-center justify-between"><h2 className="ss-label">Rest timer</h2><span className="font-mono text-2xl" role="timer" aria-label="Rest remaining">{timeText(remaining)}</span></div><p className="text-xs text-zinc-400">Optional timer. Set the rest prescribed in your instructions.</p><div className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 text-xs">Seconds<input type="number" className="ss-field" min={1} max={3600} step={1} disabled={running} value={duration} onChange={e => { const n = Number(e.target.value); setDuration(n); if (n >= 1 && n <= 3600) setRemaining(n) }} /></label><button type="button" className="ss-secondary" disabled={!Number.isInteger(duration) || duration < 1 || duration > 3600} onClick={() => { if (running) setRunning(false); else { end.current = Date.now() + (remaining || duration) * 1000; setRunning(true) } }}>{running ? 'Pause' : 'Start'}</button><button type="button" className="ss-secondary" onClick={() => { setRunning(false); setRemaining(duration >= 1 && duration <= 3600 ? duration : 120) }}>Reset</button></div>{remaining === 0 && <p role="status" className="text-orange-300">Rest timer finished.</p>}</section>
}
