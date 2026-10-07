import type { LocalRow } from './offline-store';
import type { PlanSession, PlanResult, UserPlanEnrollment } from '@/types/database';
import type { AthleteRecord, ExerciseLog } from './training';
import type { PreviousExercise } from './exercise-logging';
export type OfflinePack = LocalRow & {
  plan: { id: string; title: string; equipment_required: string[] };
  sessions: PlanSession[]; results: (PlanResult & { revision?: number })[];
  records: AthleteRecord[]; logs: ExerciseLog[]; history: PreviousExercise[]; enrollment: UserPlanEnrollment;
};
