'use client'
import { RECORDS, type Prescription, type RecordKey } from '@/lib/training'
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
                          rounding: e.target.value === 'kg' ? 2.5 : 5,
                        })
                      }
                    >
                      <option value="lb">lb</option>
                      <option value="kg">kg</option>
                    </select>
                  </label>
                  <label className="text-xs">
                    Increase after comfortable completion
                    <input
                      type="number"
                      className={field}
                      value={r.increment}
                      min={0}
                      max={100}
                      step={0.5}
                      onChange={(e) =>
                        change(i, { increment: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className="text-xs">
                    Round down to nearest (total weight)
                    <input
                      type="number"
                      className={field}
                      value={r.rounding}
                      min={0.5}
                      max={100}
                      step={0.5}
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
