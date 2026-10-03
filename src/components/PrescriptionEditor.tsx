'use client'
import {
  RECORDS,
  progressionAmounts,
  type Prescription,
  type RecordKey,
} from '@/lib/training'
export function PrescriptionEditor({
  value,
  onChange,
  allowPrevious = true,
}: {
  value: Prescription[]
  onChange: (value: Prescription[]) => void
  allowPrevious?: boolean
}) {
  const field =
    'w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-2 text-sm'
  const change = (i: number, patch: Partial<Prescription>) =>
    onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <div className="space-y-3 border-t border-zinc-700 pt-3">
      <p className="text-sm font-medium">Personalized targets</p>
      <p className="text-xs text-zinc-400">
        Targets supplement the workout description. Timed targets use a
        percentage of the full recorded distance: 120% of a 1-mile time is a
        slower 1-mile target. For weights, increase the percentage in later
        sessions or use previous performance. Keep the same label, sets, and
        reps to carry progression between sessions.
      </p>
      {value.map((r, i) => {
        const timed = RECORDS[r.record_key].kind === 'time'
        const amounts = progressionAmounts(r)
        return (
          <div
            key={r.id}
            className="space-y-3 rounded-lg border border-zinc-600 p-3"
          >
            <div className="flex justify-between">
              <span className="text-sm">Target {i + 1}</span>
              <button
                type="button"
                className="text-red-400 text-sm"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                Remove target
              </button>
            </div>
            <label className="block text-xs">
              Exercise label
              <input
                className={field}
                value={r.label}
                maxLength={100}
                onChange={(e) => change(i, { label: e.target.value })}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs">
                Reference record
                <select
                  className={field}
                  value={r.record_key}
                  onChange={(e) => {
                    const key = e.target.value as RecordKey
                    change(i, {
                      record_key: key,
                      strategy:
                        RECORDS[key].kind === 'time' ? 'percent' : r.strategy,
                    })
                  }}
                >
                  {(Object.keys(RECORDS) as RecordKey[]).map((k) => (
                    <option key={k} value={k}>
                      {RECORDS[k].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                {timed
                  ? 'Percentage of finish time'
                  : 'Starting % of current max'}
                <input
                  type="number"
                  className={field}
                  value={r.percent}
                  min={1}
                  max={300}
                  step={0.5}
                  onChange={(e) =>
                    change(i, { percent: Number(e.target.value) })
                  }
                />
              </label>
              <label className="text-xs">
                Sets / repeats
                <input
                  type="number"
                  className={field}
                  value={r.sets}
                  min={1}
                  max={100}
                  onChange={(e) => change(i, { sets: Number(e.target.value) })}
                />
              </label>
              <label className="text-xs">
                {timed ? 'Distance repetitions per set' : 'Reps per set'}
                <input
                  type="number"
                  className={field}
                  value={r.reps}
                  min={1}
                  max={1000}
                  onChange={(e) => change(i, { reps: Number(e.target.value) })}
                />
              </label>
              {!timed && (
                <>
                  <label className="text-xs">
                    Progression
                    <select
                      className={field}
                      value={r.strategy}
                      onChange={(e) =>
                        change(i, {
                          strategy: e.target.value as Prescription['strategy'],
                        })
                      }
                    >
                      <option value="percent">Use prescribed % of max</option>
                      {allowPrevious && (
                        <option value="previous">
                          Use previous performance in this plan
                        </option>
                      )}
                    </select>
                  </label>
                  <label className="text-xs">
                    Weight unit
                    <select
                      className={field}
                      value={r.unit}
                      onChange={(e) =>
                        change(i, {
                          unit: e.target.value as 'lb' | 'kg',
                          rounding: e.target.value === 'kg' ? 1.25 : 2.5,
                          ...(amounts.mode === 'fixed'
                            ? {
                                increment: e.target.value === 'kg' ? 2.5 : 5,
                                comfortable_increment:
                                  e.target.value === 'kg' ? 5 : 10,
                              }
                            : {}),
                        })
                      }
                    >
                      <option value="lb">lb</option>
                      <option value="kg">kg</option>
                    </select>
                  </label>
                  {r.strategy === 'previous' && (
                    <>
                      <label className="text-xs">
                        Increase method
                        <select
                          className={field}
                          value={amounts.mode}
                          onChange={(e) =>
                            change(i, {
                              progression_mode: e.target.value as
                                'fixed' | 'percentage',
                              increment:
                                e.target.value === 'percentage'
                                  ? 2
                                  : r.unit === 'kg'
                                    ? 2.5
                                    : 5,
                              comfortable_increment:
                                e.target.value === 'percentage'
                                  ? 3
                                  : r.unit === 'kg'
                                    ? 5
                                    : 10,
                            })
                          }
                        >
                          <option value="fixed">Fixed weight increase</option>
                          <option value="percentage">
                            Percentage of actual logged load
                          </option>
                        </select>
                      </label>
                      <label className="text-xs">
                        Hard completion increase (
                        {amounts.mode === 'percentage' ? '%' : r.unit})
                        <input
                          type="number"
                          className={field}
                          value={amounts.hard}
                          min={0}
                          max={amounts.mode === 'percentage' ? 10 : 100}
                          step="any"
                          onChange={(e) =>
                            change(i, { increment: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label className="text-xs">
                        Comfortable completion increase (
                        {amounts.mode === 'percentage' ? '%' : r.unit})
                        <input
                          type="number"
                          className={field}
                          value={amounts.comfortable}
                          min={amounts.hard}
                          max={amounts.mode === 'percentage' ? 10 : 100}
                          step="any"
                          onChange={(e) =>
                            change(i, {
                              comfortable_increment: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      {amounts.mode === 'fixed' && (
                        <div className="space-y-2 text-xs sm:col-span-2">
                          <p>Optional presets for total weight increases:</p>
                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              className="text-orange-400"
                              onClick={() =>
                                change(i, {
                                  increment: r.unit === 'kg' ? 1.25 : 2.5,
                                  comfortable_increment:
                                    r.unit === 'kg' ? 2.5 : 5,
                                  rounding: r.unit === 'kg' ? 1.25 : 2.5,
                                })
                              }
                            >
                              Upper body:{' '}
                              {r.unit === 'kg' ? '1.25 / 2.5 kg' : '2.5 / 5 lb'}
                            </button>
                            <button
                              type="button"
                              className="text-orange-400"
                              onClick={() =>
                                change(i, {
                                  increment: r.unit === 'kg' ? 2.5 : 5,
                                  comfortable_increment:
                                    r.unit === 'kg' ? 5 : 10,
                                  rounding: r.unit === 'kg' ? 2.5 : 5,
                                })
                              }
                            >
                              Lower body:{' '}
                              {r.unit === 'kg' ? '2.5 / 5 kg' : '5 / 10 lb'}
                            </button>
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-zinc-400 sm:col-span-2">
                        Hard / comfortable both mean all sets and reps completed
                        with good form. Missed reps repeat the actual load.
                        Percentages apply to the actual logged weight, not the
                        profile max. Rounded percentage targets may remain
                        unchanged; users can adjust manually. Changing the unit
                        or method resets increase amounts—review them before
                        saving.
                      </p>
                    </>
                  )}
                  <label className="text-xs">
                    Round down to nearest (total weight)
                    <input
                      type="number"
                      className={field}
                      value={r.rounding}
                      min={0.5}
                      max={100}
                      step="any"
                      onChange={(e) =>
                        change(i, { rounding: Number(e.target.value) })
                      }
                    />
                  </label>
                </>
              )}
            </div>
          </div>
        )
      })}
      <button
        type="button"
        className="text-sm text-orange-400"
        onClick={() =>
          onChange([
            ...value,
            {
              id: crypto.randomUUID(),
              label: 'Back squat',
              record_key: 'squat',
              sets: 3,
              reps: 5,
              percent: 70,
              strategy: 'percent',
              increment: 5,
              unit: 'lb',
              rounding: 5,
            },
          ])
        }
      >
        + Add personalized target
      </button>
    </div>
  )
}
