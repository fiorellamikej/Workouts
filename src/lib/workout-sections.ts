import { definitionsFromText, exerciseKey, type ExerciseDefinition } from './exercise-logging'
import type { Prescription } from './training'

export type WorkoutSection = { id: string; title: string; instructions: string; exercises: ExerciseDefinition[]; rules: Prescription[]; equipment: string[] }
const heading = /^(?:#{1,3}\s*|(?:[A-D]|\d{1,2})[.)]\s*)?((?:movement prep|warm[ -]?up|strength(?:\s*(?:&|and)\s*skill)?|skill(?: work)?|conditioning|metcon|stamina|recovery(?: protocol)?|cool[ -]?down|main (?:work|workout)|accessory(?: work)?|finisher))\b[^\n]*$/i
export function workoutSections(description: string | null, exercises: ExerciseDefinition[] = [], rules: Prescription[] = [], equipment: string[] = []): WorkoutSection[] {
  const lines = (description || '').split('\n')
  const sections: WorkoutSection[] = []
  let intro: string[] = []
  for (const line of lines) {
    if (heading.test(line.trim())) {
      sections.push({ id: `section-${sections.length}`, title: line.trim().replace(/^#{1,3}\s*|^(?:[A-D]|\d{1,2})[.)]\s*/g, ''), instructions: '', exercises: [], rules: [], equipment: [] })
    } else if (sections.length) sections[sections.length - 1].instructions += `${line}\n`
    else intro.push(line)
  }
  if (!sections.length) sections.push({ id: 'section-0', title: 'Workout', instructions: description || '', exercises: [], rules: [], equipment: [] })
  else if (intro.join('\n').trim()) sections[0].instructions = `${intro.join('\n').trim()}\n\n${sections[0].instructions}`
  intro = []
  const definitions = exercises.length ? exercises : definitionsFromText(description)
  for (const exercise of definitions) {
    const specified = exercise.section?.trim()
    let target = specified ? sections.find(s => s.title.toLowerCase() === specified.toLowerCase()) : undefined
    if (specified && !target) { target = { id: `section-${sections.length}`, title: specified, instructions: '', exercises: [], rules: [], equipment: [] }; sections.push(target) }
    target ||= sections.find(s => exerciseKey(s.instructions).includes(exerciseKey(exercise.label))) || sections[0]
    target.exercises.push(exercise)
  }
  for (const rule of rules) {
    const target = sections.find(s => s.exercises.some(e => e.id === rule.id || exerciseKey(e.label) === exerciseKey(rule.label))) || sections.find(s => exerciseKey(s.instructions).includes(exerciseKey(rule.label))) || sections[0]
    target.rules.push(rule)
    if (!target.exercises.some(e => e.id === rule.id || exerciseKey(e.label) === exerciseKey(rule.label))) target.exercises.push({ id: rule.id, label: rule.label, sets: Math.min(50, rule.sets), reps: rule.reps })
  }
  return sections.map(s => {
    const explicit = s.instructions.match(/^\s*equipment\s*:\s*(.+)$/im)?.[1]
    return { ...s, instructions: s.instructions.trim(), equipment: explicit ? explicit.split(/[,;|]/).map(v => v.trim()).filter(Boolean) : equipment }
  })
}
export function supersetGroups(section: WorkoutSection) {
  return section.exercises.reduce<{ label: string; exercises: ExerciseDefinition[] }[]>((groups, exercise) => {
    const prefix = exercise.label.match(/^([A-Z])\d[.\s:-]+/)
    const group = exercise.superset || (prefix ? `Superset ${prefix[1]}` : '')
    const last = groups[groups.length - 1]
    if (group && last?.label === group) last.exercises.push(exercise)
    else groups.push({ label: group, exercises: [exercise] })
    return groups
  }, [])
}
export function trainingProgress(sessions: { id: string; session_type: string }[], completedIds: string[]) {
  const training = sessions.filter(s => s.session_type !== 'rest')
  const ids = new Set(completedIds)
  const completed = training.filter(s => ids.has(s.id)).length
  return { completed, total: training.length, percent: training.length ? Math.round(completed / training.length * 100) : 0 }
}
