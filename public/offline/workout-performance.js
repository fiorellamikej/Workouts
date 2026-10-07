import { exerciseKey } from './exercise-logging.js';
import { convertWeight, progressionAmounts, RECORDS } from './training.js';
export const workingSets = (entry) => entry.sets.filter(s => s.set_type !== 'warmup');
export function setBaseline(rule, entries) {
    if (RECORDS[rule.record_key].kind === 'time')
        return null;
    const entry = entries.find(e => exerciseKey(e.label) === exerciseKey(rule.label));
    if (!entry)
        return null;
    const eligible = workingSets(entry).filter(s => s.completed && s.reps != null && s.reps >= rule.reps && s.weight != null && s.weight > 0);
    if (!eligible.length)
        return null;
    return { value: Number(Math.max(...eligible.map(s => convertWeight(s.weight, entry.unit, rule.unit))).toFixed(4)), count: eligible.length, complete: eligible.length >= rule.sets };
}
export function historySummary(previous) {
    const sets = workingSets(previous.entry).filter(s => s.completed && s.reps != null && s.weight != null);
    if (sets.length)
        return sets.map(s => `${s.weight} ${previous.entry.unit} × ${s.reps}`).join(', ');
    if (previous.entry.duration_seconds)
        return `${previous.entry.duration_seconds} seconds${previous.entry.distance ? ` / ${previous.entry.distance} ${previous.entry.distance_unit}` : ''}`;
    if (previous.entry.distance)
        return `${previous.entry.distance} ${previous.entry.distance_unit}`;
    return 'No completed working sets recorded';
}
export function feedbackGuidance(rule) {
    if (rule.strategy !== 'previous')
        return { hard: 'Keep the prescribed PR percentage.', comfortable: 'Keep the prescribed PR percentage.', missed: 'Adjust manually; the program percentage stays fixed.' };
    const a = progressionAmounts(rule), unit = a.mode === 'percentage' ? '%' : ` ${rule.unit}`;
    return { hard: `Standard increase: +${a.hard}${unit}, subject to rounding.`, comfortable: `Larger increase: +${a.comfortable}${unit}, subject to rounding.`, missed: 'Repeat the logged load or adjust manually.' };
}
