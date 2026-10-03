export const RECORDS = {
  squat: { label: 'Back squat', kind: 'weight' },
  deadlift: { label: 'Deadlift', kind: 'weight' },
  bench: { label: 'Bench press', kind: 'weight' },
  power_clean: { label: 'Power clean', kind: 'weight' },
  overhead_press: { label: 'Overhead press', kind: 'weight' },
  mile: { label: '1 mile run', kind: 'time' },
  '5k': { label: '5K run', kind: 'time' },
  '2_mile': { label: '2 mile run', kind: 'time' },
} as const
export type RecordKey = keyof typeof RECORDS
export type AthleteRecord = {
  id: string
  user_id: string
  record_key: RecordKey
  value: number
  unit: 'lb' | 'kg' | 'seconds'
  achieved_at: string
  notes: string | null
  created_at: string
}
export type Prescription = {
  id: string
  label: string
  record_key: RecordKey
  sets: number
  reps: number
  percent: number
  strategy: 'percent' | 'previous'
  increment: number
  progression_mode?: 'fixed' | 'percentage'
  comfortable_increment?: number
  unit: 'lb' | 'kg'
  rounding: number
}
export type ExerciseLog = {
  id: string
  enrollment_id: string
  result_id: string
  prescription_id: string
  record_key: RecordKey
  label: string
  sets: number
  reps: number
  value: number
  unit: 'lb' | 'kg' | 'seconds'
  outcome: 'comfortable' | 'hard' | 'missed'
  created_at: string
}
export function convertWeight(value: number, from: string, to: string) {
  return from === to
    ? value
    : from === 'lb'
      ? value / 2.2046226218
      : value * 2.2046226218
}
export function recordValue(record: AthleteRecord, unit: 'lb' | 'kg' = 'lb') {
  return record.unit === 'seconds'
    ? Number(record.value)
    : convertWeight(Number(record.value), record.unit, unit)
}
export function bestRecord(records: AthleteRecord[], key: RecordKey) {
  return records
    .filter((r) => r.record_key === key)
    .sort((a, b) => {
      const diff = recordValue(a) - recordValue(b)
      return RECORDS[key].kind === 'time' ? diff : -diff
    })[0]
}
export function trainingRecord(records: AthleteRecord[], key: RecordKey) {
  // Most recent declared capability, rather than an all-time max that may be stale.
  return records
    .filter((r) => r.record_key === key)
    .sort(
      (a, b) =>
        b.achieved_at.localeCompare(a.achieved_at) ||
        b.created_at.localeCompare(a.created_at),
    )[0]
}
export function timeText(seconds: number) {
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
export function parseDuration(input: string): number | null {
  const m = input.trim().match(/^(\d+):([0-5]\d)$/)
  if (!m) return null
  const total = Number(m[1]) * 60 + Number(m[2])
  return total > 0 && total < 1000000 ? total : null
}
export function outcomeText(outcome: ExerciseLog['outcome']) {
  return outcome === 'hard'
    ? 'Completed all sets/reps but hard'
    : outcome === 'comfortable'
      ? 'Completed all sets/reps but comfortable'
      : 'Missed sets/reps — repeat or adjust manually'
}
export function progressionAmounts(rule: Prescription) {
  return {
    hard: rule.increment,
    comfortable:
      rule.comfortable_increment ??
      (rule.increment <= 50 ? rule.increment * 2 : rule.increment),
    mode: rule.progression_mode ?? 'fixed',
  }
}
export function suggestion(
  rule: Prescription,
  records: AthleteRecord[],
  logs: ExerciseLog[] = [],
) {
  const record = trainingRecord(records, rule.record_key)
  const timed = RECORDS[rule.record_key].kind === 'time'
  const previous =
    !timed && rule.strategy === 'previous'
      ? logs
          .filter(
            (l) =>
              l.record_key === rule.record_key &&
              l.label.trim().toLowerCase() ===
                rule.label.trim().toLowerCase() &&
              l.sets === rule.sets &&
              l.reps === rule.reps &&
              l.unit !== 'seconds',
          )
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
      : undefined
  if (!record && !previous)
    return {
      value: null,
      text: 'Add a record in your profile to see a target.',
      basis: '',
    }
  let value: number
  let basis: string
  if (previous) {
    const last = convertWeight(Number(previous.value), previous.unit, rule.unit)
    const amounts = progressionAmounts(rule)
    if (previous.outcome === 'missed') {
      value = last
      basis =
        'Missed sets/reps: repeat the actual logged load or adjust manually.'
    } else {
      const increase =
        previous.outcome === 'comfortable' ? amounts.comfortable : amounts.hard
      const target =
        amounts.mode === 'percentage'
          ? last * (1 + increase / 100)
          : last + increase
      // Round increases down to available total-weight increments; never reduce a manual load.
      value = Math.max(
        last,
        Math.floor((target + 1e-8) / rule.rounding) * rule.rounding,
      )
      basis = `Actual logged load + ${increase}${amounts.mode === 'percentage' ? '%' : ` ${rule.unit}`} (${previous.outcome === 'comfortable' ? 'comfortable completion' : 'hard completion'})`
      if (increase > 0 && value <= last + 1e-8)
        basis +=
          '. Rounding leaves the load unchanged; use a smaller weight increment or adjust manually.'
    }
  } else {
    value = (recordValue(record!, rule.unit) * rule.percent) / 100
    basis = `${rule.percent}% of your ${record!.achieved_at} record (${timed ? 'time' : '1-rep max'})`
    value = timed
      ? Math.round(value)
      : Math.max(0, Math.floor((value + 1e-8) / rule.rounding) * rule.rounding)
  }
  if (value <= 0)
    return {
      value: null,
      text: 'Target below your rounding increment. Adjust the increment or choose a load manually.',
      basis,
    }
  return {
    value,
    text: timed ? timeText(value) : `${Number(value.toFixed(2))} ${rule.unit}`,
    basis,
  }
}
export function validatePrescriptions(rules: Prescription[]) {
  const ids = new Set<string>()
  for (const r of rules) {
    if (
      !r.id ||
      ids.has(r.id) ||
      !r.label.trim() ||
      r.label.length > 100 ||
      !(r.record_key in RECORDS)
    )
      return 'Each target needs a unique ID, label, and record.'
    ids.add(r.id)
    if (
      ![r.percent, r.increment, r.rounding, r.sets, r.reps].every(
        Number.isFinite,
      ) ||
      r.percent < 1 ||
      r.percent > 300 ||
      r.increment < 0 ||
      r.increment > 100 ||
      r.rounding < 0.5 ||
      r.rounding > 100 ||
      !Number.isInteger(r.sets) ||
      r.sets < 1 ||
      r.sets > 100 ||
      !Number.isInteger(r.reps) ||
      r.reps < 1 ||
      r.reps > 1000
    )
      return 'Check target percentages, increments, sets, and reps.'
    if (RECORDS[r.record_key].kind === 'weight' && r.percent > 100)
      return 'Lift percentages cannot exceed 100% of the current max.'
    const amounts = progressionAmounts(r)
    if (
      !['fixed', 'percentage'].includes(amounts.mode) ||
      !Number.isFinite(amounts.comfortable) ||
      amounts.comfortable < amounts.hard ||
      amounts.comfortable > 100
    )
      return 'The comfortable increase must be at least the hard increase and no more than 100.'
    if (
      amounts.mode === 'percentage' &&
      (amounts.hard > 10 || amounts.comfortable > 10)
    )
      return 'Percentage increases must be between 0% and 10%.'
    if (
      r.strategy === 'previous' &&
      amounts.mode === 'fixed' &&
      Math.abs(
        amounts.comfortable / r.rounding -
          Math.round(amounts.comfortable / r.rounding),
      ) > 1e-8
    )
      return 'Fixed increases must be multiples of the total-weight rounding increment.'
    if (
      r.strategy === 'previous' &&
      amounts.mode === 'fixed' &&
      r.increment > 0 &&
      Math.abs(
        r.increment / r.rounding - Math.round(r.increment / r.rounding),
      ) > 1e-8
    )
      return 'Progression increments must be a multiple of the rounding increment.'
    if (RECORDS[r.record_key].kind === 'time' && r.strategy !== 'percent')
      return 'Timed targets use a percentage of the recorded time.'
  }
  return rules.length > 40 ? 'Maximum 40 targets per workout.' : null
}
