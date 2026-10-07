import { allLocal, getLocal, putLocal, deleteLocal, offlineUser, setOfflineUser, syncQueue } from '../lib/offline-store';
import { workoutSections } from '../lib/workout-sections';
import { exerciseKey, validateEntries, type ExerciseEntry } from '../lib/exercise-logging';
import { suggestion, parseDuration, RECORDS } from '../lib/training';
import { setBaseline, feedbackGuidance, historySummary } from '../lib/workout-performance';
import type { OfflinePack } from '../lib/offline-pack';
import type { PlanSession } from '@/types/database';

const root = document.getElementById('content')!;
const status = document.getElementById('status')!;
let userId = '', pack: OfflinePack | null = null;
let writeChain: Promise<unknown> = Promise.resolve();
function say(text: string) { status.textContent = text; }
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') { const element = document.createElement(tag); element.textContent = text; element.className = className; return element; }
function button(text: string, action: () => void | Promise<void>, primary = false) {
  const b = node('button', text, primary ? 'primary' : ''); b.type = 'button'; b.addEventListener('click', () => { void Promise.resolve(action()).catch(e => say(e.message || 'Action failed. Local data is preserved.')); }); return b;
}
function field(parent: HTMLElement, label: string, value: string, change: (value: string) => void, type = 'text') {
  const l = node('label', label), input = node('input'); input.type = type; input.value = value; input.setAttribute('aria-label', label);
  input.addEventListener('input', () => change(input.value)); l.append(input); parent.append(l); return input;
}
function popup(text: string) { const d = node('dialog'); d.append(node('h2', 'New personal record!'), node('p', text), button('Continue', () => { d.close(); d.remove(); })); document.body.append(d); d.showModal(); }

async function sync() {
  say('Checking account and syncing...');
  const response = await fetch('/api/offline/user', { cache: 'no-store' }), identity = await response.json();
  if (!identity.userId || identity.userId !== userId) throw new Error('Sign in online with the account that recorded these workouts. Local data is preserved.');
  const queueBefore = (await allLocal('queue')).filter(r => r.userId === userId);
  const outcomes = await syncQueue(userId);
  // Update downloaded snapshots only after an acknowledged server save.
  for (const outcome of outcomes) {
    const queued = queueBefore.find(r => r.id === outcome.id), event = queued?.event as { target?: { planId?: string; sessionId?: string }; kind?: string } | undefined;
    if (event?.kind === 'complete' && event.target?.planId) {
      const packs = (await allLocal<OfflinePack>('packs')).filter(p => p.userId === userId && p.plan.id === event.target!.planId);
      for (const cached of packs) {
        const completed = Array.isArray(cached.locallyCompleted) ? cached.locallyCompleted as string[] : [];
        await putLocal('packs', { ...cached, locallyCompleted: [...new Set([...completed, event.target!.sessionId!])] });
      }
    }
  }
  const prs = outcomes.flatMap(o => o.data.prs || []);
  say(outcomes.length ? 'Saved workouts synced. Refresh the program download online to get current server targets and result revisions.' : 'No pending workouts.');
  if (prs.length) popup(prs.map(p => `${p.label}: ${p.value} ${p.unit}`).join(', ') + ' saved in your profile.');
}
async function home() {
  root.replaceChildren(); pack = null;
  root.append(node('h1', 'Offline programs'));
  if (!userId) { root.append(node('p', 'Sign in online, then make a joined program available offline before leaving service.')); const link = node('a', 'Sign in'); link.href = '/auth/login'; root.append(link); return; }
  const packs = (await allLocal<OfflinePack>('packs')).filter(p => p.userId === userId);
  const queue = (await allLocal('queue')).filter(r => r.userId === userId);
  const drafts = (await allLocal('drafts')).filter(r => r.userId === userId);
  const actions = node('div', '', 'actions'); actions.append(button('Sync saved workouts', async () => { try { await sync(); } finally { await home(); } }, true)); root.append(actions);
  root.append(node('p', `${queue.length} action(s) awaiting sync. Program data: ${Math.round(packs.reduce((n, p) => n + (p.bytes || 0), 0) / 1024)} KB.`, 'sub'));
  for (const cached of packs) {
    const panel = node('section', '', 'panel'); panel.append(node('h2', cached.plan.title), node('p', `Downloaded ${new Date(cached.updatedAt).toLocaleDateString()} · no videos`, 'sub'));
    const a = node('div', '', 'actions'); a.append(button('Open program', async () => { pack = cached; await chooseSession(); }, true), button('Remove download', async () => {
      if (!confirm('Remove this downloaded program? Unsynced workouts and drafts are kept.')) return;
      await deleteLocal('packs', cached.id); await home();
    })); panel.append(a); root.append(panel);
  }
  if (!packs.length) root.append(node('p', 'No programs downloaded for this account. Open a joined program online and choose Make program available offline.'));
  if (queue.length) {
    const panel = node('section', '', 'panel'); panel.append(node('h2', 'Pending sync'));
    queue.forEach(row => {
      const article = node('div', '', 'panel'); article.append(node('p', String(row.title || 'Workout')), node('p', String(row.error || 'Saved on this device; waiting for connection.'), 'gold'));
      article.append(button('View saved submission', () => { const details = node('pre', JSON.stringify(row.event, null, 2)); article.append(details); }));
      article.append(button('Copy saved submission', async () => { await navigator.clipboard.writeText(JSON.stringify(row.event, null, 2)); say('Submission copied. Keep it for comparison with the online result.'); }));
      if (row.error) article.append(node('p', 'Reconcile this submission with the online result before discarding. Other queued work is kept.', 'sub'), button('Discard after reconciling', async () => {
        if (!confirm('Have you copied/reconciled this submission online? Discard this queued action and its draft, and remove its downloaded program to avoid stale targets? This cannot be undone. Other queued work is kept.')) return;
        const event = row.event as { target?: { planId?: string } };
        if (event.target?.planId) {
          const cached = (await allLocal<OfflinePack>('packs')).filter(p => p.userId === userId && p.plan.id === event.target!.planId);
          for (const item of cached) await deleteLocal('packs', item.id);
        }
        if (typeof row.draftId === 'string') await deleteLocal('drafts', row.draftId);
        await deleteLocal('queue', row.id); say('Reconciled action discarded. Download the program again online before continuing.'); await home();
      }));
      panel.append(article);
    }); root.append(panel);
  }
  if (drafts.length) root.append(node('p', `${drafts.length} workout draft(s) are preserved. Open the corresponding downloaded day to resume an offline draft, or the original online workout to resume its draft.`, 'sub'));
}
async function chooseSession() {
  if (!pack) return;
  root.replaceChildren(button('All offline programs', home), node('h1', pack.plan.title));
  root.append(node('p', 'Downloaded programming stays fixed until you refresh it online. Saved results sync only after the server accepts them.', 'sub'));
  const completed = new Set([...(pack.localPending as string[] || []), ...(pack.locallyCompleted as string[] || []), ...pack.results.map(r => r.session_id)]);
  for (const session of pack.sessions) {
    const title = `Week ${session.week_number}, day ${session.day_number}: ${session.title}${completed.has(session.id) ? ' · Saved' : ''}`;
    root.append(button(title, () => openWorkout(session)));
  }
}
type OfflineDraft = { entries: ExerciseEntry[]; section: number; logs: Record<string, { value: string; outcome: 'hard' | 'comfortable' | 'missed' }>; notes: string; time: string; rounds: string; extra: string; rx: boolean; checkpoints: Record<string, { operation: string; event: Record<string, unknown> }>; finalOperation?: string };
async function openWorkout(session: PlanSession) {
  if (!pack) return;
  const currentPack = pack;
  const existing = currentPack.results.find(r => r.session_id === session.id);
  const target = { kind: 'plan', planId: currentPack.plan.id, enrollmentId: currentPack.enrollment.id, sessionId: session.id, attempt: currentPack.enrollment.current_attempt };
  const sections = workoutSections(session.description, session.exercises || [], existing?.prescriptions_snapshot || session.prescriptions || [], currentPack.plan.equipment_required);
  const rules = sections.flatMap(s => s.rules);
  const draftId = `${userId}:offline:${session.id}:${target.attempt}:${existing?.id || 'new'}:${existing?.revision || 0}`;
  const local = await getLocal('drafts', draftId);
  const seen = new Set<string>();
  const state: OfflineDraft = local?.offlineState as OfflineDraft || {
    entries: existing?.exercise_entries?.length ? structuredClone(existing.exercise_entries) : sections.flatMap(s => s.exercises).filter(e => { const key = exerciseKey(e.label); if (seen.has(key)) return false; seen.add(key); return true; }).map(e => ({ id: e.id, label: e.label, unit: rules.find(r => exerciseKey(r.label) === exerciseKey(e.label))?.unit || 'lb', sets: Array.from({ length: e.sets }, () => ({ reps: null, weight: null, rpe: null, completed: false })) })),
    section: 0, logs: {}, notes: existing?.notes || '', time: existing?.completion_time_seconds ? `${Math.floor(existing.completion_time_seconds / 60)}:${String(existing.completion_time_seconds % 60).padStart(2, '0')}` : '', rounds: existing?.rounds != null ? String(existing.rounds) : '', extra: existing?.extra_reps != null ? String(existing.extra_reps) : '', rx: existing?.is_rx || false, checkpoints: {},
  };
  const pending = (await allLocal('queue')).find(r => r.userId === userId && r.draftId === draftId);
  if (pending) state.finalOperation = pending.id;
  function persist() {
    const snapshot = structuredClone(state);
    writeChain = writeChain.catch(() => {}).then(() => putLocal('drafts', { id: draftId, userId, updatedAt: new Date().toISOString(), title: session.title, offlineState: snapshot })).then(() => say('Saved on this device.')).catch(e => { say(e.message); throw e; });
    // Every keystroke starts an immediate write; no background-sync requirement.
    void writeChain.catch(() => {});
  }
  function resolved(rule: typeof rules[number]) {
    const baseline = setBaseline(rule, state.entries);
    return state.logs[rule.id] || { value: baseline ? String(baseline.value) : '', outcome: baseline?.complete ? 'hard' as const : 'missed' as const };
  }
  async function checkpoint() {
    const current = sections[state.section];
    const entries = state.entries.filter(e => current.exercises.some(x => exerciseKey(x.label) === exerciseKey(e.label)));
    const invalid = validateEntries(entries); if (invalid) throw new Error(invalid);
    if (!entries.some(e => e.sets.some(s => s.completed && s.reps === 1 && s.set_type !== 'warmup' && !!s.weight))) return;
    const signature = JSON.stringify(entries);
    let saved = state.checkpoints[signature];
    if (!saved) { saved = { operation: crypto.randomUUID(), event: { kind: 'checkpoint', target, entries, observed_at: new Date().toISOString() } }; state.checkpoints[signature] = saved; }
    await putLocal('queue', { id: saved.operation, userId, title: session.title, updatedAt: String(saved.event.observed_at), event: saved.event });
    if (navigator.onLine) { try { await sync(); } catch { say('Single saved locally. PR confirmation awaits sync.'); } }
    else say('Single saved locally. PR confirmation awaits sync.');
  }
  async function complete() {
    const invalid = validateEntries(state.entries); if (invalid) throw new Error(invalid);
    if (state.time && !parseDuration(state.time)) throw new Error('Finish time must use mm:ss.');
    if ((state.rounds && !/^\d+$/.test(state.rounds)) || (state.extra && !/^\d+$/.test(state.extra))) throw new Error('Rounds and extra reps must be nonnegative whole numbers.');
    const logs = rules.filter(r => resolved(r).value.trim()).map(r => { const log = resolved(r); return { prescription_id: r.id, value: RECORDS[r.record_key].kind === 'time' ? parseDuration(log.value) : Number(log.value), unit: RECORDS[r.record_key].kind === 'time' ? 'seconds' : r.unit, outcome: log.outcome }; });
    if (logs.some(l => !l.value || l.value <= 0 || l.value >= 1000000)) throw new Error('Check actual-load and time targets.');
    if (!confirm('Save this complete workout on the device and sync when connected?')) return;
    await writeChain;
    if (!state.finalOperation) state.finalOperation = crypto.randomUUID();
    const old = await getLocal('queue', state.finalOperation);
    if (!old) await putLocal('queue', { id: state.finalOperation, userId, draftId, title: session.title, updatedAt: new Date().toISOString(), event: { kind: 'complete', target, entries: state.entries, logs, result_id: existing?.id || null, expected_revision: existing?.revision || 0, observed_at: new Date().toISOString(), result: { completion_time_seconds: state.time ? parseDuration(state.time) : null, rounds: state.rounds ? Number(state.rounds) : null, extra_reps: state.extra ? Number(state.extra) : null, is_rx: state.rx, notes: state.notes, weight_used: null } } });
    persist(); await writeChain;
    const observed = new Date().toISOString(), resultId = state.finalOperation;
    const localResult = { ...(existing || {}), session_id: session.id, id: resultId, completed_at: observed };
    const updatedPack = { ...currentPack, localPending: [...new Set([...(currentPack.localPending as string[] || []), session.id])],
      results: [...currentPack.results.filter(r => r.session_id !== session.id), localResult],
      logs: [...currentPack.logs.filter(l => l.result_id !== existing?.id), ...logs.map(log => { const rule = rules.find(r => r.id === log.prescription_id)!; return { ...log, result_id: resultId, label: rule.label, record_key: rule.record_key, sets: rule.sets, reps: rule.reps, created_at: observed }; })],
      history: [...state.entries.map(entry => ({ label_key: exerciseKey(entry.label), entry: structuredClone(entry), completed_at: observed, source: 'Program (saved on device)' })), ...currentPack.history] };
    await putLocal('packs', updatedPack as unknown as OfflinePack);
    say('Workout saved on device. Sync pending.');
    if (navigator.onLine) { try { await sync(); } catch (e) { say(e instanceof Error ? e.message : 'Sync pending.'); } }
    await home();
  }
  function render() {
    const section = sections[state.section];
    root.replaceChildren(button('Program days', chooseSession), node('h1', session.title), node('h2', section.title));
    if (session.session_type === 'rest') { root.append(node('p', section.instructions || 'Scheduled rest. No result is required.')); return; }
    if ((currentPack.locallyCompleted as string[] || []).includes(session.id)) { root.append(node('p', 'This workout synced successfully. Re-download the program online before correcting it, so you have its current result revision.')); return; }
    if (state.finalOperation || (currentPack.localPending as string[] || []).includes(session.id)) { root.append(node('p', 'This workout is queued for sync. Its submitted values are locked to prevent conflicting retries.'), button('Open sync queue', home)); return; }
    root.append(node('pre', section.instructions));
    root.append(node('p', 'W = optional warm-up. Tap the row label to change type. Videos require internet.', 'sub'));
    state.entries.filter(e => section.exercises.some(x => exerciseKey(x.label) === exerciseKey(e.label))).forEach(entry => {
      const panel = node('section', '', 'panel'); panel.append(node('h3', entry.label));
      const previous = currentPack.history.find(h => h.label_key === exerciseKey(entry.label));
      if (previous) panel.append(node('p', `Last time: ${historySummary(previous)} · ${new Date(previous.completed_at).toLocaleDateString()}`, 'history'));
      const rule = section.rules.find(r => exerciseKey(r.label) === exerciseKey(entry.label));
      if (rule) {
        const resultOrder = new Set(currentPack.sessions.slice(0, currentPack.sessions.findIndex(s => s.id === session.id)).map(s => s.id));
        const earlierResults = new Set(currentPack.results.filter(r => resultOrder.has(r.session_id)).map(r => r.id));
        const prescribed = suggestion(rule, currentPack.records, currentPack.logs.filter(l => earlierResults.has(l.result_id)));
        panel.append(node('p', `${rule.sets} × ${rule.reps} · ${prescribed.text}`, 'gold'), node('p', prescribed.basis || 'Add your reference PR online, or choose your weight manually.', 'sub'));
      }
      const columns = node('div', '', 'columns'); ['Set', 'Reps', entry.unit, 'RPE', 'Done'].forEach(text => columns.append(node('span', text))); panel.append(columns);
      let count = 0;
      entry.sets.forEach((set, n) => {
        const row = node('div', '', 'row'); row.append(button(set.set_type === 'warmup' ? 'W' : String(++count), () => { set.set_type = set.set_type === 'warmup' ? 'working' : 'warmup'; persist(); render(); }));
        (['reps', 'weight', 'rpe'] as const).forEach(key => {
          const input = node('input'); input.type = 'number'; input.value = set[key] == null ? '' : String(set[key]); input.min = key === 'rpe' ? '1' : '0'; input.max = key === 'rpe' ? '10' : key === 'reps' ? '10000' : '999999'; input.step = key === 'reps' ? '1' : 'any'; input.setAttribute('aria-label', `${entry.label} row ${n + 1} ${key}`);
          input.addEventListener('input', () => { set[key] = input.value === '' ? null : Number(input.value); persist(); }); row.append(input);
        });
        const label = node('label'), done = node('input'); done.type = 'checkbox'; done.checked = set.completed; done.setAttribute('aria-label', `${entry.label} row ${n + 1} complete`); done.addEventListener('change', () => { set.completed = done.checked; persist(); }); label.append(done); row.append(label); panel.append(row);
      });
      const actions = node('div', '', 'actions');
      ['working', 'warmup'].forEach(type => { const b = button(type === 'warmup' ? '+ Add warm-up set' : '+ Add set', () => { entry.sets.push({ set_type: type as 'working' | 'warmup', reps: null, weight: null, rpe: null, completed: false }); persist(); render(); }); b.disabled = entry.sets.length >= 50; actions.append(b); });
      if (entry.sets.length > 1) actions.append(button('Remove last set', () => { entry.sets.pop(); persist(); render(); })); panel.append(actions); root.append(panel);
    });
    // Feedback is resolved at section exit after the latest set inputs have been captured.
    const actions = node('div', '', 'actions');
    if (state.section > 0) actions.append(button('Previous section', () => { state.section--; persist(); render(); }));
    actions.append(button('Log and review section', () => reviewSection(), true)); root.append(actions);
  }
  function reviewSection() {
    const current = sections[state.section];
    root.replaceChildren(node('h1', 'How did it go?'));
    current.rules.forEach(rule => {
      const baseline = setBaseline(rule, state.entries), value = resolved(rule);
      const panel = node('section', '', 'panel'); panel.append(node('h2', rule.label));
      if (baseline) panel.append(node('p', `${baseline.value} ${rule.unit} suggested from ${baseline.count} completed working set(s) meeting ${rule.reps} reps.${!baseline.complete ? ' Fewer than prescribed; defaults to Missed.' : ''}`, 'gold'));
      field(panel, 'Actual load / time (confirm or override)', value.value, v => { state.logs[rule.id] = { ...resolved(rule), value: v }; persist(); });
      const label = node('label', 'Outcome'), select = node('select');
      (['missed', 'hard', 'comfortable'] as const).forEach(outcome => { const option = node('option', `${outcome}: ${feedbackGuidance(rule)[outcome]}`); option.value = outcome; select.append(option); });
      select.value = value.outcome; select.addEventListener('change', () => { state.logs[rule.id] = { ...resolved(rule), outcome: select.value as 'hard' | 'comfortable' | 'missed' }; persist(); }); label.append(select); panel.append(label); root.append(panel);
    });
    root.append(button('Back to section', () => render()), button('Continue', async () => { await checkpoint(); if (state.section < sections.length - 1) { state.section++; persist(); render(); } else finalReview(); }, true));
  }
  function finalReview() {
    root.replaceChildren(node('h1', 'Review workout'));
    root.append(node('p', 'Check your sets and feedback before saving. Results remain on this device until the server confirms sync.', 'sub'));
    field(root, 'Finish time (optional, mm:ss)', state.time, v => { state.time = v; persist(); });
    field(root, 'Rounds (optional)', state.rounds, v => { state.rounds = v; persist(); }, 'number');
    field(root, 'Extra reps (optional)', state.extra, v => { state.extra = v; persist(); }, 'number');
    field(root, 'Workout notes', state.notes, v => { state.notes = v.slice(0, 2000); persist(); });
    const label = node('label', 'Completed as prescribed (Rx) '), rx = node('input'); rx.type = 'checkbox'; rx.checked = state.rx; rx.addEventListener('change', () => { state.rx = rx.checked; persist(); }); label.append(rx); root.append(label);
    root.append(button('Review sets', () => render()), button('Done / Save workout', complete, true));
  }
  render();
}
async function boot() {
  userId = await offlineUser() || '';
  if (navigator.onLine) {
    try { const response = await fetch('/api/offline/user', { cache: 'no-store' }), identity = await response.json(); await setOfflineUser(identity.userId); userId = identity.userId || ''; }
    catch { /* Keep the last explicitly signed-in device account while disconnected. */ }
  }
  say(navigator.onLine ? 'Device data ready. Sync requires your original account.' : 'Offline. Downloaded programs and local logging are available.');
  await home();
}
window.addEventListener('online', () => { say('Connection returned. Sync saved workouts when ready.'); });
window.addEventListener('offline', () => say('Offline. Entries continue saving on this device.'));
void boot().catch(e => say(e.message || 'Device storage unavailable.'));
