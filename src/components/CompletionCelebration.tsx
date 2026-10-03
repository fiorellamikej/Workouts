'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export function CompletionCelebration({
  planId,
  resultId,
  completedSessionId,
  completedTitle,
  completedCount,
  totalCount,
  nextSession,
}: {
  planId: string
  resultId: string
  completedSessionId: string
  completedTitle: string
  completedCount: number
  totalCount: number
  nextSession: {
    id: string
    title: string
    description: string | null
    notes: string | null
    week_number: number
    day_number: number
  } | null
}) {
  const [preview, setPreview] = useState(false)
  const [burst, setBurst] = useState(false)
  useEffect(() => {
    try {
      const key = `celebrated-${resultId}`
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, 'yes')
    } catch {
      /* Celebration still works when browser storage is unavailable. */
    }
    setBurst(true)
    const timer = setTimeout(() => setBurst(false), 2400)
    return () => clearTimeout(timer)
  }, [resultId])
  return (
    <section
      aria-labelledby="completion-title"
      className="relative overflow-hidden rounded-2xl border border-orange-500/60 bg-zinc-900 p-6 text-center"
    >
      {burst && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 motion-reduce:hidden"
        >
          {Array.from({ length: 18 }, (_, i) => (
            <span
              key={i}
              className="completion-confetti absolute top-0 h-3 w-2 rounded-sm"
              style={{
                left: `${(i * 37) % 100}%`,
                backgroundColor: i % 2 ? '#f97316' : '#facc15',
                animationDelay: `${(i % 4) * 0.12}s`,
              }}
            />
          ))}
        </div>
      )}
      <p className="text-5xl" aria-hidden="true">
        🏆
      </p>
      <h2
        id="completion-title"
        className="mt-4 text-2xl font-bold text-orange-400"
        role="status"
      >
        {completedCount === totalCount
          ? 'Program complete!'
          : 'Workout complete!'}
      </h2>
      <p className="mt-2 text-lg">Nice work. You showed up and got it done.</p>
      <p className="mt-2 text-sm text-zinc-400">
        {completedTitle} · {completedCount}/{totalCount} sessions completed in
        this run.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Link
          href="/dashboard"
          className="rounded-lg bg-orange-600 px-4 py-3 font-medium"
        >
          Done for now
        </Link>
        <Link
          href={`/plans/${planId}?day=${completedSessionId}`}
          className="rounded-lg bg-zinc-800 px-4 py-3"
        >
          View saved result
        </Link>
        {nextSession && (
          <button
            type="button"
            aria-expanded={preview}
            aria-controls="next-workout-preview"
            className="rounded-lg bg-zinc-800 px-4 py-3"
            onClick={() => setPreview(!preview)}
          >
            {preview ? 'Hide next workout' : 'Preview next workout'}
          </button>
        )}
      </div>
      {preview && nextSession && (
        <section
          id="next-workout-preview"
          className="mt-5 space-y-3 rounded-xl border border-zinc-700 p-4 text-left"
        >
          <p className="text-sm text-zinc-400">
            Next scheduled workout · Week {nextSession.week_number}, day{' '}
            {nextSession.day_number}
          </p>
          <h3 className="font-semibold">{nextSession.title}</h3>
          <p className="whitespace-pre-wrap text-sm">
            {nextSession.description}
          </p>
          {nextSession.notes && (
            <details>
              <summary className="cursor-pointer text-sm text-zinc-400">
                Workout notes
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-400">
                {nextSession.notes}
              </p>
            </details>
          )}
          <Link
            href={`/plans/${planId}?day=${nextSession.id}`}
            className="inline-block text-orange-400"
          >
            Open this workout →
          </Link>
        </section>
      )}
      <style jsx>{`
        @keyframes completion-fall {
          from {
            transform: translateY(-20px) rotate(0deg);
            opacity: 1;
          }
          to {
            transform: translateY(450px) rotate(500deg);
            opacity: 0;
          }
        }
        .completion-confetti {
          animation: completion-fall 2s ease-in forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .completion-confetti {
            animation: none;
            display: none;
          }
        }
      `}</style>
    </section>
  )
}
