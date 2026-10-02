import type { Prescription } from '@/lib/training'

export type Profile = {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  is_admin: boolean
  created_at: string
  updated_at: string
}

export type Exercise = {
  id: string
  name: string
  description: string | null
  video_url: string | null
  muscle_groups: string[] | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type Workout = {
  prescriptions: Prescription[]
  id: string
  title: string
  description: string | null
  workout_date: string
  workout_type: 'for_time' | 'amrap' | 'emom' | 'strength' | 'other'
  time_cap_seconds: number | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type Result = {
  id: string
  user_id: string
  workout_id: string
  completion_time_seconds: number | null
  rounds: number | null
  extra_reps: number | null
  weight_used: string | null
  is_rx: boolean
  notes: string | null
  created_at: string
  updated_at: string
  profiles?: Profile
  workouts?: Workout
}

export type PR = {
  id: string
  user_id: string
  exercise_id: string
  weight: number | null
  reps: number | null
  estimated_1rm: number | null
  notes: string | null
  achieved_at: string
  created_at: string
  exercises?: Exercise
  profiles?: Profile
}

export type TrainingPlan = {
  id: string
  title: string
  description: string | null
  goal: string | null
  duration_weeks: number
  difficulty: string
  tags: string[] | null
  cover_image_url: string | null
  is_published: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  // joined
  plan_sessions?: PlanSession[]
  _count?: { plan_sessions: number }
}

export type PlanSession = {
  prescriptions: Prescription[]
  id: string
  plan_id: string
  week_number: number
  day_number: number
  title: string
  description: string | null
  session_type: string
  estimated_minutes: number | null
  notes: string | null
  order_index: number
  created_at: string
  updated_at: string
}

export type UserPlanEnrollment = {
  id: string
  user_id: string
  plan_id: string
  started_at: string
  current_session_id: string | null
  status: 'active' | 'completed' | 'paused'
  completed_at: string | null
  created_at: string
  // joined
  training_plans?: TrainingPlan
  plan_sessions?: PlanSession
}

export type PlanResult = {
  id: string
  user_id: string
  enrollment_id: string
  session_id: string
  completion_time_seconds: number | null
  rounds: number | null
  extra_reps: number | null
  weight_used: string | null
  is_rx: boolean
  notes: string | null
  completed_at: string
}

// Shapes returned by the partial relation selections used in pages.
export type ResultWithProfile = Omit<Result, 'profiles'> & {
  profiles: Pick<Profile, 'display_name'> | null
}

export type ResultWithWorkout = Omit<Result, 'workouts'> & {
  workouts: Pick<Workout, 'title' | 'workout_date' | 'workout_type'> | null
}

export type ActivePlanEnrollment = Pick<
  UserPlanEnrollment,
  'id' | 'status' | 'started_at'
> & {
  training_plans: Pick<TrainingPlan, 'id' | 'title' | 'duration_weeks'> | null
}
