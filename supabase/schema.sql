-- WOD Tracker Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  display_name text,
  avatar_url text,
  is_admin boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Exercises library
create table public.exercises (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  video_url text, -- YouTube or Vimeo URL
  muscle_groups text[], -- e.g. {'legs', 'core'}
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Daily WODs
create table public.workouts (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text, -- full WOD description (movements, reps, etc.)
  workout_date date not null unique, -- one WOD per day
  workout_type text not null default 'for_time', -- for_time, amrap, emom, strength, other
  time_cap_seconds integer, -- optional time cap
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Optional: link specific exercises to a WOD (for video references)
create table public.workout_exercises (
  id uuid default uuid_generate_v4() primary key,
  workout_id uuid references public.workouts(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete cascade,
  order_index integer default 0,
  notes text -- e.g. "use 50/35 lb dumbbells"
);

-- User results for WODs
create table public.results (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  workout_id uuid references public.workouts(id) on delete cascade,
  completion_time_seconds integer, -- primary metric for most WODs
  rounds integer, -- for AMRAP
  extra_reps integer, -- leftover reps in AMRAP
  weight_used text, -- free text or structured, e.g. "135 lb" or "RX"
  is_rx boolean default true, -- Rx or Scaled
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, workout_id) -- one result per user per WOD
);

-- Personal Records (for strength movements)
create table public.prs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete cascade,
  weight numeric, -- in preferred unit
  reps integer,
  estimated_1rm numeric, -- optional calculated
  notes text,
  achieved_at date default current_date,
  created_at timestamptz default now()
);

-- Indexes for performance
create index idx_workouts_date on public.workouts(workout_date desc);
create index idx_results_workout on public.results(workout_id);
create index idx_results_user on public.results(user_id);
create index idx_prs_user_exercise on public.prs(user_id, exercise_id);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.results enable row level security;
alter table public.prs enable row level security;

-- Profiles policies
create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- Exercises: public read, admin write
create policy "Exercises are viewable by everyone"
  on public.exercises for select using (true);

create policy "Only admins can insert exercises"
  on public.exercises for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

create policy "Only admins can update exercises"
  on public.exercises for update using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

create policy "Only admins can delete exercises"
  on public.exercises for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- Workouts: public read, admin write
create policy "Workouts are viewable by everyone"
  on public.workouts for select using (true);

create policy "Only admins can insert workouts"
  on public.workouts for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

create policy "Only admins can update workouts"
  on public.workouts for update using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

create policy "Only admins can delete workouts"
  on public.workouts for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- Workout exercises: public read, admin write
create policy "Workout exercises viewable by everyone"
  on public.workout_exercises for select using (true);

create policy "Only admins manage workout exercises"
  on public.workout_exercises for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- Results: public read (for leaderboards once logged in), users manage own
create policy "Results are viewable by authenticated users"
  on public.results for select using (auth.role() = 'authenticated');

create policy "Users can insert own results"
  on public.results for insert with check (auth.uid() = user_id);

create policy "Users can update own results"
  on public.results for update using (auth.uid() = user_id);

create policy "Users can delete own results"
  on public.results for delete using (auth.uid() = user_id);

-- PRs: similar to results
create policy "PRs viewable by authenticated users"
  on public.prs for select using (auth.role() = 'authenticated');

create policy "Users can insert own PRs"
  on public.prs for insert with check (auth.uid() = user_id);

create policy "Users can update own PRs"
  on public.prs for update using (auth.uid() = user_id);

create policy "Users can delete own PRs"
  on public.prs for delete using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper: set first user as admin (run once after creating your account)
-- update public.profiles set is_admin = true where email = 'your-email@example.com';

-- ============================================================
-- TRAINING PLANS (new feature)
-- ============================================================

-- Training Plans (e.g. "ACFT Improvement", "Strength + 5k")
create table public.training_plans (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  goal text, -- short tagline e.g. "Improve ACFT score"
  duration_weeks integer not null default 4,
  difficulty text default 'intermediate', -- beginner, intermediate, advanced
  tags text[], -- e.g. {'strength', 'endurance', 'military'}
  cover_image_url text,
  is_published boolean default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Individual sessions/days inside a plan
create table public.plan_sessions (
  id uuid default uuid_generate_v4() primary key,
  plan_id uuid references public.training_plans(id) on delete cascade not null,
  week_number integer not null default 1,
  day_number integer not null default 1, -- day within the week (1-7) or sequential
  title text not null,
  description text, -- the actual workout content
  session_type text default 'workout', -- workout, rest, test, recovery
  estimated_minutes integer,
  notes text,
  order_index integer default 0, -- overall order in the plan
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Users enrolling in plans
create table public.user_plan_enrollments (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  plan_id uuid references public.training_plans(id) on delete cascade not null,
  started_at date default current_date,
  current_session_id uuid references public.plan_sessions(id),
  status text default 'active', -- active, completed, paused
  completed_at timestamptz,
  created_at timestamptz default now(),
  unique(user_id, plan_id)
);

-- Results logged against a plan session (separate from daily WOD results)
create table public.plan_results (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  enrollment_id uuid references public.user_plan_enrollments(id) on delete cascade not null,
  session_id uuid references public.plan_sessions(id) on delete cascade not null,
  completion_time_seconds integer,
  rounds integer,
  extra_reps integer,
  weight_used text,
  is_rx boolean default true,
  notes text,
  completed_at timestamptz default now(),
  unique(user_id, session_id)
);

-- Indexes
create index idx_plan_sessions_plan on public.plan_sessions(plan_id, order_index);
create index idx_enrollments_user on public.user_plan_enrollments(user_id);
create index idx_plan_results_user on public.plan_results(user_id);

-- RLS
alter table public.training_plans enable row level security;
alter table public.plan_sessions enable row level security;
alter table public.user_plan_enrollments enable row level security;
alter table public.plan_results enable row level security;

-- Training plans: public read (published), admin write
create policy "Published plans are viewable by everyone"
  on public.training_plans for select using (is_published = true or exists (
    select 1 from public.profiles where id = auth.uid() and is_admin = true
  ));

create policy "Only admins manage training plans"
  on public.training_plans for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- Plan sessions: public read if plan is published, admin write
create policy "Plan sessions viewable if plan is accessible"
  on public.plan_sessions for select using (
    exists (
      select 1 from public.training_plans tp
      where tp.id = plan_id and (tp.is_published = true or exists (
        select 1 from public.profiles where id = auth.uid() and is_admin = true
      ))
    )
  );

create policy "Only admins manage plan sessions"
  on public.plan_sessions for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- Enrollments: users manage own, admins can view all
create policy "Users can view own enrollments"
  on public.user_plan_enrollments for select using (auth.uid() = user_id);

create policy "Users can insert own enrollments"
  on public.user_plan_enrollments for insert with check (auth.uid() = user_id);

create policy "Users can update own enrollments"
  on public.user_plan_enrollments for update using (auth.uid() = user_id);

create policy "Users can delete own enrollments"
  on public.user_plan_enrollments for delete using (auth.uid() = user_id);

-- Plan results: users manage own
create policy "Users can view own plan results"
  on public.plan_results for select using (auth.uid() = user_id);

create policy "Users can insert own plan results"
  on public.plan_results for insert with check (auth.uid() = user_id);

create policy "Users can update own plan results"
  on public.plan_results for update using (auth.uid() = user_id);

create policy "Users can delete own plan results"
  on public.plan_results for delete using (auth.uid() = user_id);
