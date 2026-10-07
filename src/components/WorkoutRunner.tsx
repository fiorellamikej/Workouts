'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { reportAppError } from '@/lib/report-error'
import { entriesForSave, exerciseKey, validateEntries, type ExerciseEntry } from '@/lib/exercise-logging'
import { parseDuration, RECORDS, timeText, type ExerciseLog } from '@/lib/training'
import { supersetGroups, type WorkoutSection } from '@/lib/workout-sections'
import { loadingGuidance } from '@/lib/loading-guidance'
import { ExerciseSetLogger } from './ExerciseSetLogger'
import { ExerciseHelp } from './ExerciseHelp'
import { RestTimer } from './RestTimer'
import { PlanProgress } from './PlanProgress'
import { setBaseline, feedbackGuidance, historySummary } from '@/lib/workout-performance'
import type { PreviousExercise } from '@/lib/exercise-logging'
import { allLocal, getLocal, putLocal, deleteLocal, setOfflineUser, syncQueue } from '@/lib/offline-store'

type Existing = { id: string; completion_time_seconds: number | null; rounds: number | null; extra_reps: number | null; weight_used: string | null; notes: string | null; is_rx: boolean; exercise_entries?: ExerciseEntry[]; revision?: number; completed_at?: string; created_at?: string }
type Target = { kind: 'plan'; planId: string; enrollmentId: string; sessionId: string; attempt: number } | { kind: 'wod'; workoutId: string; workoutType: string }
type Props = { title: string; subtitle: string; sections: WorkoutSection[]; equipment?: string[]; notes?: string | null; estimatedMinutes?: number | null; target: Target; existing?: Existing | null; existingLogs?: ExerciseLog[]; suggestions?: Record<string, { text: string; basis: string }>; progress?: { completed: number; total: number }; nextUrl?: string; editable?: boolean; rest?: boolean; previewFooter?: ReactNode }
type Outcome = 'hard' | 'comfortable' | 'missed'
export function WorkoutRunner({ title, subtitle, sections, equipment = [], notes, estimatedMinutes, target, existing, existingLogs = [], suggestions = {}, progress, nextUrl, editable = true, rest = false, previewFooter }: Props) {
  const router = useRouter()
  const [stage, setStage] = useState<'preview' | 'active' | 'review' | 'complete'>('preview')
  const [index, setIndex] = useState(0)
  const [visited, setVisited] = useState<Record<string, 'done' | 'skipped'>>({})
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0), [running, setRunning] = useState(false)
  const started = useRef(0), storedElapsed = useRef(0)
  const top = useRef<HTMLDivElement>(null)
  const feedback = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<'just_done' | 'time' | 'amrap'>(existing?.rounds != null || (target.kind === 'wod' && target.workoutType === 'amrap') ? 'amrap' : existing?.completion_time_seconds != null || (target.kind === 'wod' && target.workoutType === 'for_time') ? 'time' : 'just_done')
  const [time, setTime] = useState(existing?.completion_time_seconds != null ? timeText(existing.completion_time_seconds) : '')
  const [rounds, setRounds] = useState(existing?.rounds != null ? String(existing.rounds) : '')
  const [extra, setExtra] = useState(existing?.extra_reps != null ? String(existing.extra_reps) : '')
  const [weight, setWeight] = useState(existing?.weight_used || ''), [note, setNote] = useState(existing?.notes || ''), [rx, setRx] = useState(existing?.is_rx || false)
  const [logs, setLogs] = useState<Record<string, { value: string; outcome: Outcome }>>(Object.fromEntries(existingLogs.map(l => [l.prescription_id, { value: l.unit === 'seconds' ? timeText(Number(l.value)) : String(l.value), outcome: l.outcome }])))
  const [entries, setEntries] = useState<ExerciseEntry[]>(() => {
    if (existing?.exercise_entries?.length) return structuredClone(existing.exercise_entries)
    const seen = new Set<string>()
    return sections.flatMap(s => s.exercises).filter(d => { const key = exerciseKey(d.label); if (seen.has(key)) return false; seen.add(key); return true }).map(d => ({ id: d.id, label: d.label, unit: sections.flatMap(s => s.rules).find(r => r.id === d.id || exerciseKey(r.label) === exerciseKey(d.label))?.unit || 'lb', sets: Array.from({ length: d.sets }, () => ({ reps: null, weight: null, rpe: null, completed: false })) }))
  })
  const [entrySections, setEntrySections] = useState<Record<string, string>>(() => Object.fromEntries((existing?.exercise_entries || sections.flatMap(s => s.exercises)).map(e => [e.id, sections.find(s => s.exercises.some(d => d.id === e.id || exerciseKey(d.label) === exerciseKey(e.label)))?.id || sections[0].id])))
  const [userId, setUserId] = useState(''), [ready, setReady] = useState(false), [deviceStatus, setDeviceStatus] = useState('Checking device storage...')
  const [previous, setPrevious] = useState<PreviousExercise[]>([])
  const [prMessage, setPrMessage] = useState('')
  const prDialog = useRef<HTMLDialogElement>(null)
  const checkpoints = useRef<Record<string, { operation: string; event: Record<string, unknown> }>>({})
  const finalOperation = useRef<string | null>(null), saveChain = useRef<Promise<unknown>>(Promise.resolve())
  const draftId = userId ? `${userId}:${target.kind}:${target.kind === 'plan' ? `${target.sessionId}:${target.attempt}` : target.workoutId}:${existing?.id || 'new'}:${existing?.revision || 0}` : ''
  useEffect(() => {
    let active = true
    const restore = async () => {
      try {
        const { data: { user } } = await createClient().auth.getUser()
        if (!user || !active) return
        setUserId(user.id); await setOfflineUser(user.id)
        const key = `${user.id}:${target.kind}:${target.kind === 'plan' ? `${target.sessionId}:${target.attempt}` : target.workoutId}:${existing?.id || 'new'}:${existing?.revision || 0}`
        const draft = await getLocal('drafts', key)
        if (draft && active) {
          const saved = draft.state as { entries: ExerciseEntry[]; logs: typeof logs; visited: typeof visited; index: number; stage: typeof stage; entrySections: typeof entrySections; mode: typeof mode; time: string; rounds: string; extra: string; weight: string; note: string; rx: boolean; timerBase: number; timerStarted: number; running: boolean; checkpoints?: typeof checkpoints.current; finalOperation?: string }
          setEntries(saved.entries); setLogs(saved.logs); setVisited(saved.visited); setIndex(Math.min(saved.index, sections.length - 1)); setStage(saved.stage); setEntrySections(saved.entrySections); setMode(saved.mode); setTime(saved.time); setRounds(saved.rounds); setExtra(saved.extra); setWeight(saved.weight); setNote(saved.note); setRx(saved.rx)
          storedElapsed.current = saved.timerBase || 0; started.current = saved.timerStarted || Date.now(); setElapsed(storedElapsed.current + (saved.running ? Math.max(0, Math.floor((Date.now() - started.current) / 1000)) : 0)); setRunning(saved.running); checkpoints.current = saved.checkpoints || {}; finalOperation.current = saved.finalOperation || null
          setDeviceStatus('Restored your workout from this device.')
        } else if (active) setDeviceStatus('Device saving ready.')
        const pending = (await allLocal('queue')).find(row => row.userId === user.id && row.draftId === key)
        if (pending) { finalOperation.current = pending.id; setStage('complete'); setDeviceStatus('Workout queued for sync. Submitted values are locked; open Offline programs to review the queue.') }
      } catch (e) { if (active) setDeviceStatus(e instanceof Error ? e.message : 'Device saving unavailable.') }
      finally { if (active) setReady(true) }
    }
    void restore()
    return () => { active = false }
  // A new workout/result revision remounts this component.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    let active = true
    const labels = [...new Set(sections.flatMap(s => [...s.exercises.map(e => e.label), ...s.rules.map(r => r.label)]))]
    void createClient().rpc('previous_exercise_performance', { p_labels: labels, p_exclude: existing?.id || null }).then(({ data, error }) => { if (active) { setPrevious(data || []); if (error) setDeviceStatus('History could not load. Current entries remain editable.') } })
    return () => { active = false }
  }, [sections, existing?.id])
  useEffect(() => {
    if (!ready || !draftId || stage === 'preview' || finalOperation.current) return
    const state = { entries, logs, visited, index, stage, entrySections, mode, time, rounds, extra, weight, note, rx, timerBase: storedElapsed.current, timerStarted: started.current, running, checkpoints: checkpoints.current, finalOperation: finalOperation.current }
    setDeviceStatus('Saving on device...')
    saveChain.current = saveChain.current.catch(() => {}).then(() => putLocal('drafts', { id: draftId, userId, updatedAt: new Date().toISOString(), title, state })).then(() => setDeviceStatus('Saved on this device. Press Done to sync the completed workout.')).catch(e => { setDeviceStatus(e.message); setError('Device saving failed. Keep this page open and save online before leaving.') })
  }, [ready, draftId, userId, title, entries, logs, visited, index, stage, entrySections, mode, time, rounds, extra, weight, note, rx, running])
  const section = sections[index]
  const rules = sections.flatMap(s => s.rules)
  useEffect(() => {
    if (!running) return
    const tick = () => setElapsed(storedElapsed.current + Math.floor((Date.now() - started.current) / 1000))
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer)
  }, [running])
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    if (stage === 'active' || stage === 'review' || stage === 'complete') window.addEventListener('beforeunload', unload)
    return () => window.removeEventListener('beforeunload', unload)
  }, [stage])
  function changeStage(value: typeof stage) { setStage(value); setError(''); top.current?.scrollIntoView({ behavior: 'instant', block: 'start' }) }
  function changeSection(n: number) { setIndex(n); top.current?.scrollIntoView({ behavior: 'instant', block: 'start' }) }
  function start() { if (!running) { started.current = Date.now(); setRunning(true) }; changeStage('active') }
  function pause() { if (running) { storedElapsed.current = storedElapsed.current + Math.floor((Date.now() - started.current) / 1000); setElapsed(storedElapsed.current); setRunning(false) } else { started.current = Date.now(); setRunning(true) } }
  function next(skipped = false) {
    setVisited(v => ({ ...v, [section.id]: skipped ? 'skipped' : 'done' }))
    if (index < sections.length - 1) changeSection(index + 1)
    else { if (running) { storedElapsed.current += Math.floor((Date.now() - started.current) / 1000); setElapsed(storedElapsed.current); setRunning(false) }; changeStage('review') }
  }
  function resolvedLog(rule: typeof rules[number]) {
    const baseline = setBaseline(rule, entries)
    const manual = logs[rule.id]
    return { value: manual?.value !== undefined ? manual.value : baseline ? String(baseline.value) : '', outcome: manual?.outcome || (baseline?.complete ? 'hard' : 'missed') as Outcome }
  }
  async function checkpointNext(skipped = false) {
    if (busy) return
    if (skipped) { next(true); return }
    const entriesToRecord = entriesForSave(visibleEntries())
    if (!entriesToRecord.some(e => e.sets.some(s => s.completed && s.set_type !== 'warmup' && s.reps === 1 && !!s.weight))) { next(); return }
    setBusy(true)
    try {
      if (!userId) throw new Error('Sign in before recording a PR.')
      const signature = JSON.stringify(entriesToRecord)
      let checkpoint = checkpoints.current[signature]
      if (!checkpoint) { checkpoint = { operation: crypto.randomUUID(), event: { kind: 'checkpoint', target, entries: entriesToRecord, observed_at: new Date().toISOString() } }; checkpoints.current[signature] = checkpoint }
      await putLocal('queue', { id: checkpoint.operation, userId, event: checkpoint.event, updatedAt: String(checkpoint.event.observed_at), title })
      if (navigator.onLine) {
        try {
          const outcomes = await syncQueue(userId)
          const confirmed = await getLocal('settings', `receipt:${checkpoint.operation}`)
          const prs = outcomes.find(o => o.id === checkpoint.operation)?.data.prs || (confirmed?.data as { prs?: { label: string; value: number; unit: string }[] } | undefined)?.prs || []
          if (prs.length) { setPrMessage(`New one-rep PR saved: ${prs.map(p => `${p.label} ${p.value} ${p.unit}`).join(', ')}. Congratulations!`); prDialog.current?.showModal() }
        } catch (e) { setDeviceStatus(e instanceof Error ? e.message : 'PR check saved on device; sync pending.') }
      } else setDeviceStatus('Completed single saved on device. PR confirmation will happen when synced.')
      next()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the single on this device. Retry before advancing.') }
    finally { setBusy(false) }
  }
  function logNext() { const invalid = validateEntries(entriesForSave(entries)); if (invalid) { setError(invalid); return }; if (target.kind === 'plan' && section.rules.length) feedback.current?.showModal(); else void checkpointNext() }
  function visibleEntries() { return entries.filter(e => (entrySections[e.id] || sections[0].id) === section.id) }
  function updateVisible(value: ExerciseEntry[]) {
    const ids = new Set(visibleEntries().map(e => e.id))
    setEntries(old => [...old.filter(e => !ids.has(e.id)), ...value])
    setEntrySections(old => ({ ...old, ...Object.fromEntries(value.map(e => [e.id, section.id])) }))
  }
  function validate() {
    const invalid = validateEntries(entriesForSave(entries)); if (invalid) return invalid
    if (mode === 'time' && !parseDuration(time)) return 'Enter a finish time as mm:ss, such as 12:30.'
    if (mode === 'amrap' && (!/^\d+$/.test(rounds) || (extra !== '' && !/^\d+$/.test(extra)) || Number(rounds) > 100000 || Number(extra) > 100000)) return 'Enter whole, nonnegative rounds and reps (maximum 100000).'
    for (const r of rules) {
      const v = resolvedLog(r).value.trim(); if (!v) continue
      const parsed = RECORDS[r.record_key].kind === 'time' ? parseDuration(v) : Number(v)
      if (!parsed || !Number.isFinite(parsed) || parsed <= 0 || parsed >= 1000000) return `Check the actual result for ${r.label}.`
    }
    return ''
  }
  async function save() {
    if (busy) return
    const invalid = validate(); if (invalid) { setError(invalid); changeStage('review'); setError(invalid); return }
    setBusy(true); setError('')
    const result = { completion_time_seconds: mode === 'time' ? parseDuration(time) : null, rounds: mode === 'amrap' ? Number(rounds) : null, extra_reps: mode === 'amrap' ? Number(extra || 0) : null, weight_used: weight || null, notes: note || null, is_rx: rx, exercise_entries: entriesForSave(entries) }
    try {
      if (!userId) throw new Error('Sign in before saving.')
      await saveChain.current
      const pending = (await allLocal('queue')).find(row => row.userId === userId && row.draftId === draftId)
      if (pending) finalOperation.current = pending.id
      if (!finalOperation.current) finalOperation.current = crypto.randomUUID()
      const operation = finalOperation.current
      const receipt = await getLocal('settings', `receipt:${operation}`)
      if (receipt) { router.push('/dashboard'); router.refresh(); return }
      const old = await getLocal('queue', operation)
      const exerciseLogs = rules.filter(r => resolvedLog(r).value.trim()).map(r => { const log = resolvedLog(r); return { prescription_id: r.id, value: RECORDS[r.record_key].kind === 'time' ? parseDuration(log.value) : Number(log.value), unit: RECORDS[r.record_key].kind === 'time' ? 'seconds' : r.unit, outcome: log.outcome } })
      if (!old) await putLocal('queue', { id: operation, userId, draftId, title, updatedAt: new Date().toISOString(), event: { kind: 'complete', target, result, entries: result.exercise_entries, logs: exerciseLogs, result_id: existing?.id || null, expected_revision: existing?.revision || 0, observed_at: new Date().toISOString() } })
      if (!navigator.onLine) { setDeviceStatus('Workout saved on device. Open Offline programs to sync when connected.'); setError(''); setBusy(false); return }
      const outcomes = await syncQueue(userId)
      const confirmed = await getLocal('settings', `receipt:${operation}`)
      const prs = outcomes.find(o => o.id === operation)?.data.prs || (confirmed?.data as { prs?: { label: string; value: number; unit: string }[] } | undefined)?.prs || []
      await deleteLocal('drafts', draftId)
      if (prs.length) {
        setPrMessage(`New one-rep PR saved: ${prs.map(p => `${p.label} ${p.value} ${p.unit}`).join(', ')}. Congratulations!`); prDialog.current?.showModal(); setBusy(false)
      } else { router.push(target.kind === 'plan' ? `/dashboard?savedPlan=${encodeURIComponent(target.planId)}&savedSession=${encodeURIComponent(target.sessionId)}` : `/dashboard?savedWod=${encodeURIComponent(target.workoutId)}`); router.refresh() }
    } catch (e) { void reportAppError(e); setError(e && typeof e === 'object' && 'message' in e ? String(e.message) : 'Could not save. Check your connection and retry.'); setBusy(false) }
  }
  const projected = progress ? Math.min(progress.total, progress.completed + (existing || rest ? 0 : 1)) : 0
  const equipmentList = [...new Set([...equipment, ...sections.flatMap(s => s.equipment)])]
  function targetFields(sectionRules = rules) { return sectionRules.map(r => {
    const value = resolvedLog(r)
    return <div key={r.id} className="ss-panel space-y-3"><h3 className="font-bold">{r.label}</h3><p className="text-orange-300">{r.sets} × {r.reps} · {suggestions[r.id]?.text || 'Choose your load manually'}</p><p className="text-sm text-zinc-400">{suggestions[r.id]?.basis}</p>
      {previous.find(p => p.label_key === exerciseKey(r.label)) && <div className="border-l-2 border-amber-400 p-3 text-sm text-zinc-100"><strong className="text-amber-200">Last time</strong><p>{historySummary(previous.find(p => p.label_key === exerciseKey(r.label))!)}</p><p className="text-zinc-300">{new Date(previous.find(p => p.label_key === exerciseKey(r.label))!.completed_at).toLocaleDateString()}</p></div>}
      {!suggestions[r.id]?.basis && <p className="text-sm text-zinc-100">Add your {RECORDS[r.record_key].label} record in <Link href="/profile#record-form" className="text-amber-200 underline">PR logging</Link>, or choose your load manually.</p>}
      {setBaseline(r, entries) && <p className="text-sm text-amber-200">Suggested actual-load baseline: {setBaseline(r, entries)!.value} {r.unit}, from {setBaseline(r, entries)!.count} completed working set(s) meeting {r.reps} reps. Confirm or override below.{!setBaseline(r, entries)!.complete && ' Fewer than the prescribed sets qualify; feedback defaults to Missed.'}</p>}
      <label className="block text-sm">Actual {RECORDS[r.record_key].kind === 'time' ? 'time (mm:ss)' : `load (${r.unit})`} used<input className="ss-field" value={value.value} onChange={e => setLogs(old => ({ ...old, [r.id]: { ...value, value: e.target.value } }))} placeholder="Optional actual result" /></label>
      <label className="block text-sm">How did it go?<select className="ss-field" value={value.outcome} onChange={e => setLogs(old => ({ ...old, [r.id]: { ...value, outcome: e.target.value as Outcome } }))}><option value="hard">Hard: completed all sets and reps</option><option value="comfortable">Comfortable: completed all sets and reps</option><option value="missed">Missed sets or reps</option></select></label>
      <p className="text-sm text-zinc-200">{feedbackGuidance(r)[value.outcome]} RPE does not select the increase automatically.</p>
      <details className="text-sm text-zinc-200"><summary className="min-h-11 cursor-pointer py-3 text-orange-300">Loading and progression guidance</summary>{loadingGuidance(r).map(line => <p key={line} className="mt-2">{line}</p>)}</details>
    </div>
  }) }
  return <div ref={top} className="scroll-mt-24 space-y-5 pb-32">
    <p role="status" className="text-sm text-amber-200">{deviceStatus}</p>
    <p className="font-mono text-xs uppercase tracking-wider text-orange-300">{subtitle}</p>
    {stage === 'preview' && <>
      <h1 className="ss-title">{title}</h1><p className="text-zinc-400">{rest ? 'Scheduled rest' : `${sections.length} workout section${sections.length === 1 ? '' : 's'}`}{estimatedMinutes ? ` · About ${estimatedMinutes} minutes` : ''}{existing ? ' · Completed' : ''}</p>
      {!!equipmentList.length && <section><h2 className="ss-label mb-3">Required equipment{equipment.length ? ' (plan)' : ''}</h2><div className="flex flex-wrap gap-2">{equipmentList.map(e => <span className="ss-tag" key={e}>{e}</span>)}</div></section>}
      {sections.map((s, n) => <section key={s.id} className="ss-panel space-y-4"><h2 className="ss-label flex gap-3"><span className="text-orange-400">{String(n + 1).padStart(2, '0')}</span>{s.title}</h2><p className="whitespace-pre-wrap leading-relaxed text-zinc-300">{s.instructions || 'Follow the exercise instructions below.'}</p>{supersetGroups(s).map((group, i) => <div className={group.label ? 'space-y-3 border-l-2 border-orange-500 pl-4' : 'space-y-3'} key={i}>{group.label && <h3 className="ss-label text-orange-300">{group.label}</h3>}{group.exercises.map(e => <div key={e.id} className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{e.label}</h3><p className="text-sm text-zinc-400">{e.sets} sets{e.reps != null ? ` × ${e.reps} reps` : ''}</p>{e.instructions && <p className="mt-1 text-sm text-zinc-300">{e.instructions}</p>}</div><ExerciseHelp label={e.label} /></div>)}</div>)}</section>)}
      {notes && <details className="ss-panel"><summary className="min-h-11 cursor-pointer font-semibold">Workout notes</summary><p className="whitespace-pre-wrap leading-relaxed text-zinc-300">{notes}</p></details>}
      {rest ? <p className="ss-panel">Rest is part of your plan. No workout result is needed today.</p> : editable ? <button disabled={!ready || !userId} onClick={start} className="ss-primary w-full">{existing ? 'Review / Edit Saved Workout' : 'Start Workout'} →</button> : <p className="ss-panel">Logging is unavailable while this program is paused or archived. Your saved history remains available.</p>}
      {progress && <PlanProgress {...progress} />}
      {previewFooter}
      <Link href="/dashboard" className="ss-secondary">Back Home</Link>
    </>}
    {stage === 'active' && <>
      <div className="flex items-center justify-between border-b border-zinc-700 pb-3"><span className="font-mono text-lg">{timeText(elapsed)} <span className="text-xs text-zinc-400">ELAPSED</span></span><button type="button" className="ss-secondary" onClick={pause}>{running ? 'Pause' : 'Resume'}</button></div>
      <nav aria-label="Workout sections" className="flex gap-2 overflow-x-auto pb-1">{sections.map((s, n) => <button key={s.id} type="button" aria-current={n === index ? 'step' : undefined} onClick={() => changeSection(n)} className={`min-h-12 min-w-14 border px-3 font-mono ${n === index ? 'border-orange-500 bg-orange-500/15 text-orange-300' : 'border-zinc-600 text-zinc-400'}`} aria-label={`${s.title}${visited[s.id] ? `, ${visited[s.id]}` : ''}`}>{visited[s.id] === 'done' ? '✓' : visited[s.id] === 'skipped' ? '−' : String(n + 1).padStart(2, '0')}</button>)}</nav>
      <h1 className="ss-title">{section.title}</h1><p className="ss-label text-orange-300">Section {index + 1} of {sections.length}</p>
      <section className="ss-panel"><h2 className="ss-label mb-3">Instructions & Intent</h2><p className="whitespace-pre-wrap leading-relaxed text-zinc-300">{section.instructions || 'Follow the prescribed exercises below.'}</p></section>
      {!!section.equipment.length && <div className="flex flex-wrap gap-2">{section.equipment.map(e => <span className="ss-tag" key={e}>{e}</span>)}</div>}
      <ExerciseSetLogger entries={visibleEntries()} onChange={updateVisible} excludeResultId={existing?.id} disabled={busy} collapsible compact instructions={Object.fromEntries(section.exercises.map(e => [e.id, e.instructions || '']))} groupLabels={Object.fromEntries(supersetGroups(section).flatMap(g => g.exercises.map(e => [e.id, g.label])))} />
      {target.kind === 'plan' ? targetFields(section.rules) : section.rules.map(r => <div className="ss-panel" key={r.id}><p className="font-bold">{r.label} · {r.sets} × {r.reps}</p><p className="text-orange-300">{suggestions[r.id]?.text}</p><p className="mt-2 text-sm text-zinc-400">{suggestions[r.id]?.basis}</p></div>)}
      <details className="ss-panel"><summary className="ss-label min-h-11 cursor-pointer py-3">Rest timer</summary><RestTimer /></details>
      <p className="text-xs text-zinc-400">Entries save on this device as you work. Log & Next checks completed singles for PRs. Done saves the full result and progression, or queues it offline.</p>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      <div className="ss-actions flex gap-2"><button type="button" className="ss-secondary" disabled={busy} onClick={() => next(true)}>Skip</button><button type="button" className="ss-primary" disabled={busy} onClick={logNext}>{index === sections.length - 1 ? 'Log and Review Workout' : 'Log & Next'} →</button></div>
      <button type="button" className="ss-secondary" onClick={() => changeStage('preview')}>Workout overview</button>
    </>}
    {stage === 'review' && <>
      <h1 className="ss-title">Log and Review Workout</h1><p className="text-zinc-400">Check your results before committing. Section navigation does not mark individual sets complete.</p>
      <div className="flex flex-wrap gap-2">{sections.map((s, n) => <button key={s.id} type="button" className="ss-secondary" onClick={() => { changeSection(n); changeStage('active') }}>{s.title} · {visited[s.id] || 'Not reviewed'}</button>)}</div>
      <ExerciseSetLogger entries={entries} onChange={setEntries} excludeResultId={existing?.id} disabled={busy} collapsible />
      {target.kind === 'plan' && targetFields()}
      <section className="ss-panel space-y-3"><label className="block text-sm">Result type<select className="ss-field" value={mode} disabled={target.kind === 'wod'} onChange={e => setMode(e.target.value as typeof mode)}><option value="just_done">Mark completed</option><option value="time">Finish time</option><option value="amrap">Rounds + reps</option></select></label>
        {mode === 'time' && <label className="block text-sm">Finish time (mm:ss)<input className="ss-field" value={time} onChange={e => setTime(e.target.value)} placeholder="12:30" /></label>}
        {mode === 'amrap' && <div className="grid grid-cols-2 gap-3"><label>Rounds<input className="ss-field" type="number" min={0} step={1} value={rounds} onChange={e => setRounds(e.target.value)} /></label><label>Extra reps<input className="ss-field" type="number" min={0} step={1} value={extra} onChange={e => setExtra(e.target.value)} /></label></div>}
        <label className="block text-sm">Weights / scaling notes<input className="ss-field" value={weight} onChange={e => setWeight(e.target.value)} maxLength={1000} /></label><label className="block text-sm">Workout notes<textarea className="ss-field" value={note} onChange={e => setNote(e.target.value)} maxLength={2000} /></label><label className="flex min-h-12 items-center gap-3"><input type="checkbox" checked={rx} onChange={e => setRx(e.target.checked)} />Completed as prescribed (Rx)</label>
      </section>{error && <p role="alert" className="text-red-300">{error}</p>}
      <button className="ss-primary w-full" onClick={() => { const invalid = validate(); if (invalid) setError(invalid); else changeStage('complete') }}>Review Summary →</button>
    </>}
    {stage === 'complete' && <>
      <section className="ss-panel space-y-5 text-center"><p className="text-5xl text-orange-400" aria-hidden="true">✓</p><h1 className="ss-title">Nice Work!</h1><h2 className="text-xl font-bold">{title}</h2><p className="text-sm text-zinc-400">Your workout is ready to save.</p><div className="grid grid-cols-2 gap-3"><div className="border border-zinc-600 p-4"><p className="text-3xl font-mono">{timeText(elapsed)}</p><p className="ss-label mt-2 text-zinc-400">Session elapsed</p></div><div className="border border-zinc-600 p-4"><p className="text-3xl font-mono">{Object.values(visited).filter(v => v === 'done').length}/{sections.length}</p><p className="ss-label mt-2 text-zinc-400">Sections reviewed</p></div></div>
        {mode !== 'just_done' && <p className="font-mono text-orange-300">{mode === 'time' ? `Finish time: ${time}` : `${rounds} rounds + ${extra || 0} reps`}</p>}
        {sections.some(s => visited[s.id] !== 'done') && <p className="text-sm text-orange-300">Some sections were skipped or not reviewed. Review the log and scaling notes before saving.</p>}
      </section>{progress && <PlanProgress completed={projected} total={progress.total} pending={!existing} />}
      {error && <p role="alert" className="text-red-300">{error}</p>}<button className="ss-secondary w-full" disabled={busy || !!finalOperation.current} onClick={() => changeStage('review')}>Review / Edit</button><button className="ss-primary w-full" disabled={busy} onClick={save}>{busy ? 'Saving...' : existing ? 'Done / Save Corrections' : 'Done / Save Workout'}</button>
      <p className="text-center text-xs text-zinc-400">Done commits your result and returns Home.{nextUrl ? ' Your next scheduled workout will be available to preview.' : ''}</p>
    </>}
    <dialog ref={prDialog} className="w-[calc(100%-2rem)] max-w-lg border border-amber-400 bg-zinc-950 p-5 text-zinc-100 backdrop:bg-black/80"><h2 className="ss-title text-amber-200">New personal record!</h2><p className="my-4">{prMessage}</p><button type="button" className="ss-primary" onClick={() => { prDialog.current?.close(); if (finalOperation.current) { router.push('/dashboard'); router.refresh() } }}>Continue</button></dialog>
    <dialog ref={feedback} className="w-[calc(100%-2rem)] max-w-lg border border-zinc-600 bg-zinc-950 p-5 text-zinc-100 backdrop:bg-black/80"><h2 className="ss-title text-2xl">How did it go?</h2><p className="my-3 text-zinc-400">Choose an outcome for each target. Actual results entered above guide the next suggested load; blank results do not change progression.</p>{section.rules.map(r => { const value = resolvedLog(r); return <fieldset key={r.id} className="my-4 space-y-2"><legend className="mb-2 font-bold">{r.label}</legend>{(['hard', 'comfortable', 'missed'] as const).map(outcome => <label key={outcome} className={`flex min-h-14 items-center gap-3 border p-3 ${value.outcome === outcome ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-600'}`}><input type="radio" name={`outcome-${r.id}`} checked={value.outcome === outcome} onChange={() => setLogs(old => ({ ...old, [r.id]: { ...value, outcome } }))} /><span><strong className="uppercase">{outcome === 'missed' ? 'Missed reps' : outcome}</strong><span className="block text-sm text-zinc-200">{outcome === 'missed' ? 'Missed sets or reps' : `Completed all sets and reps${outcome === 'hard' ? ', but hard' : ' comfortably'}`} · {feedbackGuidance(r)[outcome]}</span></span></label>)}</fieldset> })}<button type="button" className="ss-primary w-full" disabled={busy} onClick={() => { feedback.current?.close(); void checkpointNext() }}>Continue →</button><button type="button" className="ss-secondary mt-2 w-full" onClick={() => feedback.current?.close()}>Back to section</button></dialog>
  </div>
}
