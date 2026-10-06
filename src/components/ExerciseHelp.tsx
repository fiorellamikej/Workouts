'use client'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getYouTubeEmbedUrl } from '@/lib/utils'
import type { Exercise } from '@/types/database'
export function ExerciseHelp({ label }: { label: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function show() {
    dialog.current?.showModal(); setOpen(true); setExercise(null); setLoading(true); setError('')
    try {
      const { data, error } = await createClient().from('exercises').select('*').ilike('name', label.replace(/^[A-Z]\d[.\s:-]+/, '').replace(/[%_]/g, '')).limit(1).maybeSingle<Exercise>()
      if (error) throw error
      setExercise(data)
    } catch { setError('Could not load this exercise. Try again or open Exercise Examples.') }
    finally { setLoading(false) }
  }
  const embed = exercise ? getYouTubeEmbedUrl(exercise.video_url) : null
  return <><button type="button" aria-label={`Show me how to do ${label}`} onClick={show} className="ss-secondary text-orange-300">▷ <span className="hidden sm:inline">Show me how</span></button>
    <dialog ref={dialog} onClose={() => setOpen(false)} onClick={e => { if (e.target === e.currentTarget) dialog.current?.close() }} className="w-[calc(100%-2rem)] max-w-xl border border-zinc-600 bg-zinc-950 p-5 text-zinc-100 backdrop:bg-black/80">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-xl font-bold">{exercise?.name || label}</h2><button type="button" onClick={() => dialog.current?.close()} className="ss-secondary" aria-label="Close exercise example">✕</button></div>
      {open && embed && <iframe src={embed} title={exercise?.name || label} className="aspect-video w-full" allow="encrypted-media; picture-in-picture" allowFullScreen />}
      {loading ? <p role="status">Loading example...</p> : error ? <p role="alert">{error}</p> : <p className="mt-3 whitespace-pre-wrap text-zinc-300">{exercise?.description || 'No matching example is available yet.'}</p>}
      <Link href="/exercises" className="mt-4 inline-block text-orange-300">Exercise Examples →</Link>
    </dialog></>
}
