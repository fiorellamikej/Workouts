'use client'
import { useEffect, useRef, useState } from 'react'
import { AdminWorkoutForm } from './AdminWorkoutForm'
import { createClient } from '@/lib/supabase/client'
import { validDate, wodToday } from '@/lib/daily-wod'

type QueuedWod = { id: string; workout_date: string; title: string; workout_type: string; description: string; notes: string | null; time_cap_seconds: number | null; phase_id: string | null }
const PAGE_SIZE = 25
export function AdminWodManager() {
  const [supabase] = useState(() => createClient())
  const [selection, setSelection] = useState({ date: wodToday(), version: 0 })
  const [revision, setRevision] = useState(0)
  const [filter, setFilter] = useState('upcoming')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<QueuedWod[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const editor = useRef<HTMLDivElement>(null)
  const today = wodToday()
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    const timer = setTimeout(async () => {
      try {
        let query = supabase.from('workouts').select('id,workout_date,title,workout_type,description,notes,time_cap_seconds,phase_id', { count: 'exact' })
        if (filter === 'upcoming') query = query.gte('workout_date', today)
        if (filter === 'past') query = query.lt('workout_date', today)
        const term = search.trim()
        const pattern = `%${term.replace(/[\\%_]/g, '')}%`
        if (term) query = validDate(term) ? query.eq('workout_date', term) : query.ilike('title', pattern)
        const { data, count, error } = await query.order('workout_date', { ascending: filter !== 'past' }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1).returns<QueuedWod[]>()
        if (!active) return
        if (error) throw error
        if (page > 0 && !data?.length) { setPage(n => n - 1); return }
        setRows(data || []); setCount(count || 0)
      } catch { if (active) { setRows([]); setError('Could not load the WOD queue. Try again.') } }
      finally { if (active) setLoading(false) }
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [supabase, filter, search, page, revision, today])
  function edit(date: string) {
    setSelection(old => ({ date, version: old.version + 1 }))
    editor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return <div className="space-y-8">
    <section className="ss-panel space-y-4" aria-label="Daily WOD queue">
      <h2 className="text-xl font-semibold">Daily WOD Queue</h2>
      <p className="text-sm text-zinc-400">Review saved daily WODs and open a date to edit. This includes individual WODs and imported phases.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Show<select className="ss-field" value={filter} onChange={e => { setFilter(e.target.value); setPage(0) }}><option value="upcoming">Today and upcoming</option><option value="all">All saved WODs</option><option value="past">Past WODs</option></select></label>
        <label className="text-sm">Search title or date (YYYY-MM-DD)<input className="ss-field" type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} placeholder="Squat or 2026-10-15" /></label>
      </div>
      <button type="button" className="ss-secondary" onClick={() => edit(today)}>Create / edit a WOD by date</button>
      {loading ? <p role="status">Loading queue...</p> : error ? <div><p role="alert" className="text-red-300">{error}</p><button className="ss-secondary mt-3" onClick={() => setRevision(n => n + 1)}>Retry</button></div> : <>
        <p className="text-sm text-zinc-400">{count} saved WOD{count === 1 ? '' : 's'} match this view.</p>
        {!rows.length && <p>No WODs match. Choose another view or create a WOD by date below.</p>}
        {rows.map(w => <article key={w.id} className="space-y-3 border border-zinc-700 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-sm text-orange-300">{w.workout_date} / {w.workout_date === today ? 'Today' : w.workout_date > today ? 'Scheduled' : 'Past'}</p><h3 className="mt-1 text-lg font-bold">{w.title}</h3><p className="text-sm text-zinc-400">{w.workout_type.replace('_', ' ')}{w.phase_id ? ' / Imported phase' : ' / Individual WOD'}</p></div><button type="button" className="ss-primary" aria-label={`Edit WOD for ${w.workout_date}`} onClick={() => edit(w.workout_date)}>Edit WOD</button></div>
          <details><summary className="min-h-11 cursor-pointer py-3 text-orange-300">Review WOD</summary><p className="whitespace-pre-wrap text-zinc-300">{w.description}</p>{w.time_cap_seconds !== null && <p className="mt-2 text-sm text-zinc-400">Time cap: {w.time_cap_seconds} seconds</p>}{w.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-400">{w.notes}</p>}</details>
        </article>)}
        {count > PAGE_SIZE && <div className="flex items-center justify-between gap-3"><button className="ss-secondary" disabled={page === 0} onClick={() => setPage(n => n - 1)}>Previous</button><p className="text-sm">Page {page + 1} of {Math.ceil(count / PAGE_SIZE)}</p><button className="ss-secondary" disabled={(page + 1) * PAGE_SIZE >= count} onClick={() => setPage(n => n + 1)}>Next</button></div>}
      </>}
    </section>
    <section ref={editor} className="scroll-mt-24"><h2 className="mb-4 text-xl font-semibold">Post / Edit Daily WOD</h2><AdminWorkoutForm key={`${selection.date}-${selection.version}`} initialDate={selection.date} onSaved={() => setRevision(n => n + 1)} /></section>
  </div>
}
