'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  normalizePlanImport,
  parsePlanImport,
  type PlanImport,
} from '@/lib/plan-import'

export function PlanImportPanel({ source }: { source?: unknown }) {
  const router = useRouter()
  const [preview, setPreview] = useState<PlanImport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const lock = useRef(false)
  const field = 'w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2'
  const load = (data: PlanImport) => {
    setPreview(data)
    setError(null)
    setReviewed(false)
    setSaved(null)
  }
  const save = async () => {
    if (!preview || !reviewed || lock.current || saved) return
    lock.current = true
    setBusy(true)
    setError(null)
    try {
      const checked = normalizePlanImport(preview)
      const supabase = createClient()
      const { data: matches, error: lookupError } = await supabase
        .from('training_plans')
        .select('id')
        .eq('title', checked.plan.title)
        .limit(1)
      if (lookupError) throw lookupError
      if (matches?.length)
        throw new Error(
          'A plan with this exact title already exists. Rename this draft or edit the existing plan.',
        )
      const { data: id, error: saveError } = await supabase.rpc(
        'save_training_program',
        {
          p_plan_id: null,
          p_plan: checked.plan,
          p_sessions: checked.sessions,
        },
      )
      if (saveError) throw saveError
      if (!id)
        throw new Error(
          'No plan ID returned. Check All Plans before trying again.',
        )
      setSaved(String(id))
      router.refresh()
    } catch (e) {
      setError(
        e &&
          typeof e === 'object' &&
          'message' in e &&
          typeof e.message === 'string'
          ? e.message
          : 'Could not import. Check All Plans before retrying.',
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <section className="space-y-4 rounded-xl border border-orange-800/60 bg-zinc-900/50 p-6">
      <h2 className="text-lg font-semibold">Bulk import a training plan</h2>
      <p className="text-sm text-zinc-400">
        Upload a prepared Sword and Shield JSON file, review the whole program,
        then create a new draft. Existing plans and results are preserved.
      </p>
      <label className="block text-sm">
        Plan import file (.json)
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          className="mt-2 block w-full text-sm"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            setPreview(null)
            setError(null)
            setSaved(null)
            setReviewed(false)
            try {
              if (file.size > 5 * 1024 * 1024)
                throw new Error('File must be smaller than 5 MB.')
              load(parsePlanImport(await file.text()))
            } catch (err) {
              setError(
                err instanceof Error ? err.message : 'Unable to read file.',
              )
            }
            e.target.value = ''
          }}
        />
      </label>
      {Boolean(source) && (
        <button
          type="button"
          disabled={busy}
          className="text-sm text-orange-400"
          onClick={() => {
            try {
              const copy = normalizePlanImport(source)
              copy.plan.title = `${copy.plan.title.slice(0, 190)} (copy)`
              load(copy)
            } catch (err) {
              setError(
                err instanceof Error ? err.message : 'Unable to copy plan.',
              )
            }
          }}
        >
          Duplicate the selected plan as a new draft
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {preview && (
        <div className="space-y-4">
          <label className="block text-sm">
            New draft title
            <input
              className={field}
              maxLength={200}
              value={preview.plan.title}
              disabled={busy || !!saved}
              onChange={(e) => {
                setPreview({
                  ...preview,
                  plan: { ...preview.plan, title: e.target.value },
                })
                setReviewed(false)
              }}
            />
          </label>
          <p className="text-sm">
            {preview.plan.duration_weeks} weeks · {preview.sessions.length}{' '}
            sessions ·{' '}
            {preview.sessions.reduce((n, s) => n + s.prescriptions.length, 0)}{' '}
            personalized targets · Saved as draft
          </p>
          {preview.review_notes.length > 0 && (
            <div className="space-y-2 rounded border border-yellow-800 p-3 text-sm text-yellow-200">
              <p className="font-semibold">Review before saving</p>
              <ul className="list-disc space-y-1 pl-5">
                {preview.review_notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Plan description and instructions
            </summary>
            <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">
              {preview.plan.description}
            </p>
            <p className="mt-2 text-sm">
              Goal: {preview.plan.goal || 'Not specified'}
            </p>
          </details>
          <div className="space-y-2 text-sm">
            <p>
              Suggested fitness level:{' '}
              <span className="capitalize">{preview.plan.difficulty}</span>
            </p>
            <p className="whitespace-pre-wrap">
              {preview.plan.fitness_guidance}
            </p>
            <p>
              Required equipment:{' '}
              {preview.plan.equipment_required.join('; ') || 'Not specified'}
            </p>
            <p>
              Suggested equipment:{' '}
              {preview.plan.equipment_suggested.join('; ') || 'Not specified'}
            </p>
          </div>
          <div className="max-h-[32rem] space-y-3 overflow-y-auto rounded border border-zinc-700 p-3">
            {[...new Set(preview.sessions.map((s) => s.week_number))].map(
              (week) => (
                <details key={week} open={week === 1}>
                  <summary className="cursor-pointer font-medium">
                    Week {week}
                  </summary>
                  <div className="mt-2 space-y-3">
                    {preview.sessions
                      .filter((s) => s.week_number === week)
                      .map((s) => (
                        <article
                          key={s.order_index}
                          className="space-y-2 rounded border border-zinc-700 p-3"
                        >
                          <h3 className="font-medium">
                            Day {s.day_number}: {s.title}
                          </h3>
                          <p className="whitespace-pre-wrap text-sm text-zinc-300">
                            {s.description}
                          </p>
                          {s.notes && (
                            <p className="whitespace-pre-wrap text-xs text-zinc-400">
                              {s.notes}
                            </p>
                          )}
                          {s.prescriptions.map((r) => (
                            <p className="text-xs text-orange-300" key={r.id}>
                              {r.label} · {r.sets} × {r.reps} · Starting{' '}
                              {r.percent}% ·{' '}
                              {r.strategy === 'previous'
                                ? `${r.progression_mode || 'fixed'} progression; hard ${r.increment}, comfortable ${r.comfortable_increment ?? r.increment * 2}`
                                : 'Prescribed percentage of profile record'}{' '}
                              · {r.unit} · Rounding {r.rounding}
                            </p>
                          ))}
                        </article>
                      ))}
                  </div>
                </details>
              ),
            )}
          </div>
          {!saved && (
            <>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={reviewed}
                  disabled={busy}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I reviewed the sessions and notes. Create this as a new draft.
              </label>
              <button
                type="button"
                disabled={!reviewed || busy || !preview.plan.title.trim()}
                onClick={save}
                className="rounded bg-orange-600 px-4 py-2 font-medium disabled:opacity-50"
              >
                {busy ? 'Saving draft…' : 'Create imported draft'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPreview(null)
                  setReviewed(false)
                  setError(null)
                }}
                className="ml-3 text-sm text-zinc-400"
              >
                Cancel import
              </button>
            </>
          )}
          {saved && (
            <div className="space-y-2 text-sm text-green-400">
              <p>
                Draft created. Review it in the editor and check Published when
                ready.
              </p>
              <button
                type="button"
                className="rounded border border-green-700 px-3 py-2"
                onClick={() => router.push(`/admin/plans?edit=${saved}`)}
              >
                Open imported draft
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
