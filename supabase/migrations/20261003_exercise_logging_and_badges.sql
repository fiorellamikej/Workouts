-- Apply after 20261003_focused_program_experience.sql. No existing results are removed.
begin;
create function public.valid_exercise_definitions(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare e jsonb; seen text[] := '{}';
begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)>100 then return false; end if;
 for e in select value from jsonb_array_elements(v) loop
  if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'id') is distinct from 'string' or length(e->>'id') not between 1 and 100 or e->>'id'=any(seen) or jsonb_typeof(e->'label') is distinct from 'string' or length(trim(e->>'label')) not between 1 and 100 or jsonb_typeof(e->'sets') is distinct from 'number' or (e->>'sets')::numeric<>trunc((e->>'sets')::numeric) or (e->>'sets')::numeric not between 1 and 50 then return false; end if;
  if e->'reps' is not null and e->'reps'<>'null'::jsonb and (jsonb_typeof(e->'reps')<>'number' or (e->>'reps')::numeric<>trunc((e->>'reps')::numeric) or (e->>'reps')::numeric not between 0 and 10000) then return false; end if;
  if e ? 'instructions' and (jsonb_typeof(e->'instructions')<>'string' or length(e->>'instructions')>1000) then return false; end if;
  seen:=array_append(seen,e->>'id');
 end loop; return true;
 exception when others then return false;
end $$;
create function public.valid_exercise_entries(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare e jsonb; s jsonb; k text; n numeric; seen text[] := '{}'; label_key text; total integer:=0;
begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)>100 then return false; end if;
 for e in select value from jsonb_array_elements(v) loop
  label_key:=lower(regexp_replace(trim(e->>'label'),'\s+',' ','g'));
  if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'id') is distinct from 'string' or length(e->>'id') not between 1 and 100 or jsonb_typeof(e->'label') is distinct from 'string' or length(trim(e->>'label')) not between 1 and 100 or label_key=any(seen) or coalesce(e->>'unit','') not in ('lb','kg') or jsonb_typeof(e->'sets') is distinct from 'array' or jsonb_array_length(e->'sets') not between 1 and 50 then return false; end if;
  seen:=array_append(seen,label_key); total:=total+jsonb_array_length(e->'sets'); if total>500 then return false; end if;
  for s in select value from jsonb_array_elements(e->'sets') loop
   if jsonb_typeof(s) is distinct from 'object' or jsonb_typeof(s->'completed') is distinct from 'boolean' then return false; end if;
   foreach k in array array['reps','weight','rpe'] loop
    if not(s ? k) then return false; end if;
    if s->k<>'null'::jsonb then
     if jsonb_typeof(s->k)<>'number' then return false; end if; n:=(s->>k)::numeric;
     if (k='reps' and (n<>trunc(n) or n not between 0 and 10000)) or (k='weight' and (n<0 or n>=1000000)) or (k='rpe' and n not between 1 and 10) then return false; end if;
    end if;
   end loop;
  end loop;
  if e ? 'notes' and (jsonb_typeof(e->'notes')<>'string' or length(e->>'notes')>1000) then return false; end if;
  foreach k in array array['duration_seconds','distance'] loop
   if e ? k and e->k<>'null'::jsonb then
    if jsonb_typeof(e->k)<>'number' then return false; end if; n:=(e->>k)::numeric;
    if n<=0 or n>=1000000 or (k='duration_seconds' and n<>trunc(n)) then return false; end if;
   end if;
  end loop;
  if e ? 'distance_unit' and coalesce(e->>'distance_unit','') not in ('m','km','mi') then return false; end if;
 end loop; return true;
 exception when others then return false;
end $$;
alter table public.plan_sessions add column exercises jsonb not null default '[]' check(public.valid_exercise_definitions(exercises));
alter table public.plan_results add column exercise_entries jsonb not null default '[]' check(public.valid_exercise_entries(exercise_entries));
create table public.wod_exercise_logs (
 result_id uuid primary key references public.results(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 exercise_entries jsonb not null default '[]' check(public.valid_exercise_entries(exercise_entries))
);
alter table public.wod_exercise_logs enable row level security;
create policy "Own WOD exercise logs" on public.wod_exercise_logs for select to authenticated using(user_id=auth.uid());
grant select on public.wod_exercise_logs to authenticated;
revoke all on public.wod_exercise_logs from anon;
create function public.save_wod_exercise_result(p_workout uuid,p_result jsonb,p_entries jsonb,p_result_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); saved uuid;
begin
 if u is null then raise exception 'Please log in'; end if;
 perform pg_advisory_xact_lock(hashtext(u::text||p_workout::text));
 if not exists(select 1 from public.workouts where id=p_workout) then raise exception 'Workout not found'; end if;
 if not public.valid_exercise_entries(p_entries) or jsonb_typeof(p_result) is distinct from 'object' then raise exception 'Invalid exercise result'; end if;
 if (p_result->>'completion_time_seconds')::integer<=0 or (p_result->>'rounds')::integer<0 or (p_result->>'extra_reps')::integer<0 then raise exception 'Time must be positive; rounds and reps cannot be negative'; end if;
 if p_result_id is null then
  select id into saved from public.results where user_id=u and workout_id=p_workout;
  if found then return saved; end if;
  insert into public.results(user_id,workout_id,completion_time_seconds,rounds,extra_reps,weight_used,is_rx,notes)
  values(u,p_workout,(p_result->>'completion_time_seconds')::integer,(p_result->>'rounds')::integer,(p_result->>'extra_reps')::integer,nullif(p_result->>'weight_used',''),coalesce((p_result->>'is_rx')::boolean,false),nullif(p_result->>'notes','')) returning id into saved;
 else
  select id into saved from public.results where id=p_result_id and user_id=u and workout_id=p_workout for update;
  if not found then raise exception 'Result changed or was removed. Refresh and try again.'; end if;
  update public.results set completion_time_seconds=(p_result->>'completion_time_seconds')::integer,rounds=(p_result->>'rounds')::integer,extra_reps=(p_result->>'extra_reps')::integer,weight_used=nullif(p_result->>'weight_used',''),is_rx=coalesce((p_result->>'is_rx')::boolean,false),notes=nullif(p_result->>'notes',''),updated_at=now() where id=saved;
 end if;
 insert into public.wod_exercise_logs values(saved,u,p_entries) on conflict(result_id) do update set exercise_entries=excluded.exercise_entries;
 return saved;
end $$;
revoke all on function public.save_wod_exercise_result(uuid,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.save_wod_exercise_result(uuid,jsonb,jsonb,uuid) to authenticated;

create or replace function public.save_training_program(p_plan_id uuid,p_plan jsonb,p_sessions jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare plan_uuid uuid; item jsonb; session_uuid uuid; kept uuid[] := '{}'; position integer := 0;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_admin) then raise exception 'Admin access required'; end if;
 if jsonb_typeof(p_plan) is distinct from 'object' then raise exception 'Invalid plan'; end if;
 if p_plan ? 'fitness_guidance' and p_plan->'fitness_guidance' <> 'null'::jsonb and
   (jsonb_typeof(p_plan->'fitness_guidance') <> 'string' or length(p_plan->>'fitness_guidance') > 2000) then raise exception 'Fitness guidance must be text up to 2000 characters'; end if;
 if p_plan ? 'equipment_required' and jsonb_typeof(p_plan->'equipment_required') is distinct from 'array' then raise exception 'Required equipment must be a list'; end if;
 if p_plan ? 'equipment_suggested' and jsonb_typeof(p_plan->'equipment_suggested') is distinct from 'array' then raise exception 'Suggested equipment must be a list'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_plan->'equipment_required','[]')) x where jsonb_typeof(x) <> 'string')
  or exists(select 1 from jsonb_array_elements(coalesce(p_plan->'equipment_suggested','[]')) x where jsonb_typeof(x) <> 'string') then raise exception 'Equipment entries must be text'; end if;
 if coalesce(length(trim(p_plan->>'title')),0)=0 then raise exception 'Plan title required'; end if;
 if jsonb_typeof(p_sessions)<>'array' or jsonb_array_length(p_sessions)>1000 then raise exception 'Invalid sessions'; end if;
 if p_plan_id is null then
  insert into public.training_plans(title,description,goal,duration_weeks,difficulty,tags,is_published,created_by,equipment_required,equipment_suggested,fitness_guidance)
  values(p_plan->>'title',p_plan->>'description',p_plan->>'goal',(p_plan->>'duration_weeks')::integer,p_plan->>'difficulty',
   array(select jsonb_array_elements_text(coalesce(p_plan->'tags','[]'))),(p_plan->>'is_published')::boolean,auth.uid(),
   array(select jsonb_array_elements_text(coalesce(p_plan->'equipment_required','[]'))),
   array(select jsonb_array_elements_text(coalesce(p_plan->'equipment_suggested','[]'))),nullif(trim(p_plan->>'fitness_guidance'),'')) returning id into plan_uuid;
 else
  plan_uuid := p_plan_id;
  perform 1 from public.training_plans where id=plan_uuid for update;
  if not found then raise exception 'Plan not found'; end if;
  update public.training_plans set title=p_plan->>'title',description=p_plan->>'description',goal=p_plan->>'goal',
   duration_weeks=(p_plan->>'duration_weeks')::integer,difficulty=p_plan->>'difficulty',
   tags=array(select jsonb_array_elements_text(coalesce(p_plan->'tags','[]'))),is_published=(p_plan->>'is_published')::boolean,updated_at=now(),
   equipment_required=case when p_plan ? 'equipment_required' then array(select jsonb_array_elements_text(p_plan->'equipment_required')) else equipment_required end,
   equipment_suggested=case when p_plan ? 'equipment_suggested' then array(select jsonb_array_elements_text(p_plan->'equipment_suggested')) else equipment_suggested end,
   fitness_guidance=case when p_plan ? 'fitness_guidance' then nullif(trim(p_plan->>'fitness_guidance'),'') else fitness_guidance end
  where id=plan_uuid;
 end if;
 for item in select value from jsonb_array_elements(p_sessions) loop
  session_uuid := nullif(item->>'id','')::uuid;
  if session_uuid is not null then
   if session_uuid=any(kept) then raise exception 'Duplicate session'; end if;
   update public.plan_sessions set week_number=(item->>'week_number')::integer,day_number=(item->>'day_number')::integer,
    title=item->>'title',description=item->>'description',session_type=item->>'session_type',estimated_minutes=(item->>'estimated_minutes')::integer,
    notes=item->>'notes',order_index=position,prescriptions=coalesce(item->'prescriptions','[]'),exercises=case when item ? 'exercises' then item->'exercises' else exercises end,updated_at=now()
   where id=session_uuid and plan_id=plan_uuid;
   if not found then raise exception 'Session does not belong to this plan'; end if;
  else
   insert into public.plan_sessions(plan_id,week_number,day_number,title,description,session_type,estimated_minutes,notes,order_index,prescriptions,exercises)
   values(plan_uuid,(item->>'week_number')::integer,(item->>'day_number')::integer,item->>'title',item->>'description',item->>'session_type',
    (item->>'estimated_minutes')::integer,item->>'notes',position,coalesce(item->'prescriptions','[]'),coalesce(item->'exercises','[]')) returning id into session_uuid;
  end if;
  kept := array_append(kept,session_uuid); position := position+1;
 end loop;
 if exists(select 1 from public.plan_results r join public.plan_sessions s on s.id=r.session_id where s.plan_id=plan_uuid and not(s.id=any(kept))) then
  raise exception 'Cannot remove sessions with logged results. Keep the session or create a new plan.';
 end if;
 update public.user_plan_enrollments set current_session_id=null where plan_id=plan_uuid and current_session_id in
  (select id from public.plan_sessions where plan_id=plan_uuid and not(id=any(kept)));
 delete from public.plan_sessions where plan_id=plan_uuid and not(id=any(kept));
 update public.user_plan_enrollments e set current_session_id=(
  select s.id from public.plan_sessions s where s.plan_id=plan_uuid
   and not exists(select 1 from public.plan_results r where r.enrollment_id=e.id and r.attempt=e.current_attempt and r.session_id=s.id)
   order by s.order_index,s.week_number,s.day_number,s.id limit 1
 ) where e.plan_id=plan_uuid;
 update public.user_plan_enrollments set
  status=case when status='paused' then 'paused' when current_session_id is null and exists(select 1 from public.plan_sessions where plan_id=plan_uuid) then 'completed' else 'active' end,
  completed_at=case when current_session_id is null and exists(select 1 from public.plan_sessions where plan_id=plan_uuid) then coalesce(completed_at,now()) else null end
 where plan_id=plan_uuid;
 return plan_uuid;
end $$;

create or replace function public.save_training_session_result(p_enrollment uuid,p_session uuid,p_attempt integer,p_result jsonb,p_logs jsonb,p_result_id uuid default null) returns uuid
language plpgsql security invoker set search_path='' as $$
declare e public.user_plan_enrollments; s public.plan_sessions; saved public.plan_results; recipe jsonb; item jsonb; rules jsonb;
begin
 select * into e from public.user_plan_enrollments where id=p_enrollment and user_id=auth.uid() for update;
 if not found then raise exception 'Enrollment not found'; end if;
 select * into s from public.plan_sessions where id=p_session and plan_id=e.plan_id;
 if not found then raise exception 'Session is not in your plan'; end if;
 if p_result_id is not null then
  select * into saved from public.plan_results where id=p_result_id and user_id=auth.uid() and enrollment_id=e.id and session_id=s.id and attempt=p_attempt for update;
  if not found then raise exception 'Result changed or was removed. Refresh and try again.'; end if;
  rules:=saved.prescriptions_snapshot;
 else
  if p_attempt is distinct from e.current_attempt then raise exception 'Program was restarted. Refresh before saving.'; end if;
  select * into saved from public.plan_results where enrollment_id=e.id and attempt=p_attempt and session_id=s.id;
  if found then return saved.id; end if; -- safe retry, never overwrites an existing result
 if not e.is_following then raise exception 'Rejoin this program before changing progress'; end if;
  if e.status='paused' then raise exception 'Resume this program before logging a new result'; end if;
  rules:=s.prescriptions;
 end if;
 if p_result ? 'exercise_entries' and not public.valid_exercise_entries(p_result->'exercise_entries') then raise exception 'Invalid exercise entries'; end if;
 if jsonb_typeof(p_result) is distinct from 'object' or jsonb_typeof(p_logs) is distinct from 'array' or jsonb_array_length(p_logs)>40 then raise exception 'Invalid workout result'; end if;
 if (p_result->>'completion_time_seconds')::integer<=0 or (p_result->>'rounds')::integer<0 or (p_result->>'extra_reps')::integer<0 then raise exception 'Time must be positive; rounds and reps cannot be negative'; end if;
 if saved.id is null then
  insert into public.plan_results(user_id,enrollment_id,session_id,attempt,prescriptions_snapshot,completion_time_seconds,rounds,extra_reps,weight_used,is_rx,notes)
  values(auth.uid(),e.id,s.id,p_attempt,rules,(p_result->>'completion_time_seconds')::integer,(p_result->>'rounds')::integer,(p_result->>'extra_reps')::integer,
   nullif(p_result->>'weight_used',''),coalesce((p_result->>'is_rx')::boolean,false),nullif(p_result->>'notes','')) returning * into saved;
 else
  update public.plan_results set completion_time_seconds=(p_result->>'completion_time_seconds')::integer,rounds=(p_result->>'rounds')::integer,
   extra_reps=(p_result->>'extra_reps')::integer,weight_used=nullif(p_result->>'weight_used',''),is_rx=coalesce((p_result->>'is_rx')::boolean,false),notes=nullif(p_result->>'notes','')
  where id=saved.id;
  delete from public.training_exercise_logs where result_id=saved.id;
 end if;
 for item in select value from jsonb_array_elements(p_logs) loop
  select value into recipe from jsonb_array_elements(rules) where value->>'id'=item->>'prescription_id';
  if recipe is null then raise exception 'Unknown exercise target'; end if;
  if (item->>'unit') is distinct from (case when recipe->>'record_key' in ('mile','5k','2_mile') then 'seconds' else recipe->>'unit' end) then raise exception 'Result unit does not match the recorded target'; end if;
  insert into public.training_exercise_logs(user_id,enrollment_id,result_id,prescription_id,record_key,label,sets,reps,value,unit,outcome,created_at)
  values(auth.uid(),e.id,saved.id,item->>'prescription_id',recipe->>'record_key',recipe->>'label',(recipe->>'sets')::integer,(recipe->>'reps')::integer,
   (item->>'value')::numeric,item->>'unit',item->>'outcome',saved.completed_at);
 end loop;
 -- Editing a result never changes the selected day or resurrects a past run.
 if p_result_id is null then perform public.refresh_training_progress(e.id); end if;
 if p_result ? 'exercise_entries' then update public.plan_results set exercise_entries=p_result->'exercise_entries' where id=saved.id; end if;
 return saved.id;
end $$;

-- Caller-owned history across programs and WODs. Exact normalized names, no guessed aliases.
create function public.previous_exercise_performance(p_labels text[],p_exclude uuid default null)
returns table(label_key text,entry jsonb,completed_at timestamptz,source text)
language sql security invoker set search_path='' as $$
 with history as (
  select lower(regexp_replace(trim(x->>'label'),'\s+',' ','g')) k,x,r.completed_at t,'Program'::text src,r.id
  from public.plan_results r cross join lateral jsonb_array_elements(r.exercise_entries) x where r.user_id=auth.uid()
  union all
  select lower(regexp_replace(trim(l.label),'\s+',' ','g')),jsonb_build_object('id',l.id,'label',l.label,'unit',case when l.unit='seconds' then 'lb' else l.unit end,'sets',jsonb_build_array(jsonb_build_object('reps',l.reps,'weight',case when l.unit<>'seconds' then l.value end,'rpe',null,'completed',l.outcome<>'missed')),'duration_seconds',case when l.unit='seconds' then l.value end,'notes','Target summary: '||l.sets||' × '||l.reps||'; individual set detail was not recorded.'),r.completed_at,'Program target summary',r.id
  from public.training_exercise_logs l join public.plan_results r on r.id=l.result_id where l.user_id=auth.uid() and not exists(select 1 from jsonb_array_elements(r.exercise_entries) e where lower(regexp_replace(trim(e->>'label'),'\s+',' ','g'))=lower(regexp_replace(trim(l.label),'\s+',' ','g')))
  union all
  select lower(regexp_replace(trim(x->>'label'),'\s+',' ','g')),x,r.created_at,'Daily WOD',r.id
  from public.results r join public.wod_exercise_logs l on l.result_id=r.id cross join lateral jsonb_array_elements(l.exercise_entries) x where r.user_id=auth.uid()
 ), cutoff as (
  select completed_at t from public.plan_results where id=p_exclude and user_id=auth.uid()
  union all select created_at from public.results where id=p_exclude and user_id=auth.uid()
 )
 select distinct on(k) k,x,t,src from history
 where id is distinct from p_exclude and k=any(array(select lower(regexp_replace(trim(l),'\s+',' ','g')) from unnest(p_labels) l))
 and t<=coalesce((select min(t) from cutoff),'infinity'::timestamptz)
 and (exists(select 1 from jsonb_array_elements(x->'sets') v where (v->>'completed')::boolean or v->'reps'<>'null'::jsonb or v->'weight'<>'null'::jsonb or v->'rpe'<>'null'::jsonb) or (x->>'duration_seconds')::numeric>0 or (x->>'distance')::numeric>0)
 order by k,t desc,id desc;
$$;
create index plan_results_user_time on public.plan_results(user_id,completed_at desc);
create index wod_results_user_time on public.results(user_id,created_at desc);
-- Private badge/activity tables. All activity timestamps come from the database.
create table public.badge_settings (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 timezone text not null default 'America/New_York',
 workout_days integer[] not null default array[0,1,2,3,4,5,6],
 schedule_configured boolean not null default false,
 constraint workout_days_valid check(cardinality(workout_days) between 1 and 7 and workout_days <@ array[0,1,2,3,4,5,6])
);
create table public.badge_schedules (
 user_id uuid references public.profiles(id) on delete cascade not null,
 effective_date date not null,workout_days integer[] not null,
 primary key(user_id,effective_date),check(cardinality(workout_days) between 1 and 7 and workout_days <@ array[0,1,2,3,4,5,6])
);
create table public.athlete_activity_days (
 user_id uuid references public.profiles(id) on delete cascade not null,
 activity_date date not null,first_seen timestamptz not null default now(),
 early_seen timestamptz,night_seen timestamptz,weekend_seen timestamptz,
 primary key(user_id,activity_date)
);
create table public.user_signup_order (
 signup_number bigserial primary key,user_id uuid unique not null references public.profiles(id) on delete cascade
);
-- Allocate existing members in signup order once. Deleted slots are never reused.
insert into public.user_signup_order(user_id) select p.id from public.profiles p join auth.users u on u.id=p.id order by u.created_at,p.id;
create table public.athlete_badges (
 user_id uuid references public.profiles(id) on delete cascade not null,
 badge_key text not null check(badge_key in ('first_login','profile_complete','anniversary','bench','squat','deadlift','big_three','comeback','early_bird','founding_member','night_owl','weekend_warrior','weekly_streak')),
 earned_at timestamptz not null default now(),level integer not null default 1 check(level>=1),primary key(user_id,badge_key)
);
alter table public.badge_settings enable row level security;
alter table public.badge_schedules enable row level security;
alter table public.athlete_activity_days enable row level security;
alter table public.user_signup_order enable row level security;
alter table public.athlete_badges enable row level security;
create policy "Own badge settings" on public.badge_settings for select to authenticated using(user_id=auth.uid());
create policy "Own badge schedules" on public.badge_schedules for select to authenticated using(user_id=auth.uid());
create policy "Own activity days" on public.athlete_activity_days for select to authenticated using(user_id=auth.uid());
create policy "Own signup slot" on public.user_signup_order for select to authenticated using(user_id=auth.uid());
create policy "Own badges" on public.athlete_badges for select to authenticated using(user_id=auth.uid());
grant select on public.badge_settings,public.badge_schedules,public.athlete_activity_days,public.user_signup_order,public.athlete_badges to authenticated;
revoke all on public.badge_settings,public.badge_schedules,public.athlete_activity_days,public.user_signup_order,public.athlete_badges from anon;
create function public.signup_badge_slot() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(743101);
 insert into public.user_signup_order(user_id) values(new.id) on conflict(user_id) do nothing;
 return new;
end $$;
create trigger allocate_signup_badge_slot after insert on public.profiles for each row execute function public.signup_badge_slot();
create function public.streak_calendar(p_user uuid,p_today date) returns table(day date,checked_in boolean,rest_day boolean)
language sql stable security definer set search_path='' as $$
 select d::date,exists(select 1 from public.athlete_activity_days a where a.user_id=p_user and a.activity_date=d::date),
 not(extract(dow from d)::integer=any(coalesce((select s.workout_days from public.badge_schedules s where s.user_id=p_user and s.effective_date<=d::date order by s.effective_date desc limit 1),array[0,1,2,3,4,5,6])))
 from generate_series((select min(activity_date)::timestamp from public.athlete_activity_days where user_id=p_user),p_today::timestamp,interval '1 day') d;
$$;
create function public.refresh_athlete_badges(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare k text; acquired timestamptz; born timestamptz; yrs integer; today date; week_day date;
begin
 if p_user is null then return; end if;
 perform pg_advisory_xact_lock(hashtext(p_user::text));
 select created_at into born from auth.users where id=p_user;
 today:=(now() at time zone coalesce((select timezone from public.badge_settings where user_id=p_user),'America/New_York'))::date;
 select min(first_seen) into acquired from public.athlete_activity_days where user_id=p_user;
 if acquired is not null then insert into public.athlete_badges values(p_user,'first_login',acquired,1) on conflict do nothing; end if;
 if exists(select 1 from public.user_signup_order where user_id=p_user and signup_number<=100) then
  insert into public.athlete_badges values(p_user,'founding_member',born,1) on conflict do nothing;
 end if;
 yrs:=extract(year from age(now(),born))::integer;
 if yrs>=1 then insert into public.athlete_badges values(p_user,'anniversary',born+interval '1 year',yrs) on conflict(user_id,badge_key) do update set level=excluded.level; end if;
 foreach k in array array['early_bird','night_owl','weekend_warrior'] loop
  select min(case k when 'early_bird' then early_seen when 'night_owl' then night_seen else weekend_seen end) into acquired from public.athlete_activity_days where user_id=p_user;
  if acquired is not null then insert into public.athlete_badges values(p_user,k,acquired,1) on conflict do nothing; end if;
 end loop;
 -- Reconcile record-derived badges after corrections and deletions.
 foreach k in array array['bench','squat','deadlift'] loop
  select min(created_at) into acquired from public.athlete_records where user_id=p_user and record_key=k;
  if acquired is null then delete from public.athlete_badges where user_id=p_user and badge_key=k;
  else insert into public.athlete_badges values(p_user,k,acquired,1) on conflict do nothing; end if;
 end loop;
 if (select count(distinct record_key) from public.athlete_records where user_id=p_user and record_key in ('bench','squat','deadlift'))=3 then
  select max(first_log) into acquired from (select min(created_at) first_log from public.athlete_records where user_id=p_user and record_key in ('bench','squat','deadlift') group by record_key) x;
  insert into public.athlete_badges values(p_user,'big_three',acquired,1) on conflict do nothing;
 else delete from public.athlete_badges where user_id=p_user and badge_key='big_three'; end if;
 select min(r.created_at) into acquired from public.athlete_records r
 where r.user_id=p_user and exists(select 1 from public.athlete_records p where p.user_id=r.user_id and p.record_key=r.record_key and p.achieved_at<r.achieved_at)
 and r.achieved_at >= (select max(p.achieved_at)+interval '6 months' from public.athlete_records p where p.user_id=r.user_id and p.record_key=r.record_key and p.achieved_at<r.achieved_at)
 and not exists(select 1 from public.athlete_records p where p.user_id=r.user_id and p.record_key=r.record_key and p.achieved_at<=r.achieved_at and p.id<>r.id and
  (case when r.unit='seconds' then p.value<=r.value else (case when p.unit='kg' then p.value*2.2046226218 else p.value end)>=(case when r.unit='kg' then r.value*2.2046226218 else r.value end) end));
 if acquired is null then delete from public.athlete_badges where user_id=p_user and badge_key='comeback';
 else insert into public.athlete_badges values(p_user,'comeback',acquired,1) on conflict do nothing; end if;
 if exists(select 1 from public.profiles p join public.badge_settings s on s.user_id=p.id where p.id=p_user and length(trim(coalesce(p.display_name,'')))>0 and s.schedule_configured) then
  insert into public.athlete_badges values(p_user,'profile_complete',now(),1) on conflict do nothing;
 else delete from public.athlete_badges where user_id=p_user and badge_key='profile_complete'; end if;
 -- Seven consecutive calendar days with attendance on each workout day. Rests need no visit.
 with calendar as (select * from public.streak_calendar(p_user,today)), spans as (
  select day,count(*) over(order by day rows between 6 preceding and current row) n,
  bool_and(checked_in or rest_day) over(order by day rows between 6 preceding and current row) ok,
  bool_or(checked_in) over(order by day rows between 6 preceding and current row) attended from calendar
 ) select min(day) into week_day from spans where n=7 and ok and attended;
 if week_day is not null then insert into public.athlete_badges values(p_user,'weekly_streak',week_day::timestamp at time zone 'UTC',1) on conflict do nothing; end if;
end $$;
create function public.record_athlete_activity(p_timezone text default 'America/New_York') returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); tz text; d date; h integer; t timestamptz:=now();
begin
 if u is null then raise exception 'Please log in'; end if;
 if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid timezone'; end if;
 insert into public.badge_settings(user_id,timezone) values(u,p_timezone) on conflict(user_id) do nothing;
 select timezone into tz from public.badge_settings where user_id=u;
 d:=(t at time zone tz)::date; h:=extract(hour from t at time zone tz)::integer;
 insert into public.athlete_activity_days(user_id,activity_date,first_seen,early_seen,night_seen,weekend_seen)
 values(u,d,t,case when h<6 then t end,case when (t at time zone tz)::time>'21:00'::time then t end,case when extract(dow from d) in (0,6) then t end)
 on conflict(user_id,activity_date) do update set early_seen=coalesce(athlete_activity_days.early_seen,excluded.early_seen),night_seen=coalesce(athlete_activity_days.night_seen,excluded.night_seen),weekend_seen=coalesce(athlete_activity_days.weekend_seen,excluded.weekend_seen);
 perform public.refresh_athlete_badges(u);
end $$;
create function public.save_badge_profile(p_display_name text,p_timezone text,p_workout_days integer[]) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); today date;
begin
 if u is null then raise exception 'Please log in'; end if;
 if length(trim(p_display_name)) not between 1 and 100 or p_display_name is null then raise exception 'Display name required (1–100 characters)'; end if;
 if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid timezone'; end if;
 if cardinality(p_workout_days) not between 1 and 7 or p_workout_days is null or not(p_workout_days <@ array[0,1,2,3,4,5,6]) or array_position(p_workout_days,null) is not null then raise exception 'Choose at least one training day'; end if;
 today:=(now() at time zone p_timezone)::date;
 update public.profiles set display_name=trim(p_display_name),updated_at=now() where id=u;
 insert into public.badge_settings values(u,p_timezone,p_workout_days,true) on conflict(user_id) do update set timezone=excluded.timezone,workout_days=excluded.workout_days,schedule_configured=true;
 -- Changes start tomorrow: a schedule edit cannot forgive yesterday's missed visit.
 insert into public.badge_schedules values(u,today+1,p_workout_days) on conflict(user_id,effective_date) do update set workout_days=excluded.workout_days;
 perform public.refresh_athlete_badges(u);
end $$;
create function public.my_badge_summary() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); tz text; today date; streak integer; total integer; days integer;
begin
 if u is null then raise exception 'Please log in'; end if;
 perform public.refresh_athlete_badges(u);
 select timezone into tz from public.badge_settings where user_id=u; today:=(now() at time zone coalesce(tz,'America/New_York'))::date;
 -- Today has until midnight to be attended. Rest days protect a chain, never manufacture a new chain.
 with c as (select * from public.streak_calendar(u,today)), last_miss as (select max(day) d from c where not checked_in and not rest_day and day<today), first_check as (select min(day) d from c where checked_in and day>coalesce((select d from last_miss),'-infinity'::date))
 select count(*) filter(where checked_in)::integer, count(*)::integer into streak,days from c where day>coalesce((select d from last_miss),'-infinity'::date) and day>=(select d from first_check);
 select (select count(*) from public.plan_results r join public.plan_sessions s on s.id=r.session_id where r.user_id=u and s.session_type<>'rest')+(select count(*) from public.results where user_id=u) into total;
 return jsonb_build_object('checkin_streak',coalesce(streak,0),'calendar_span',coalesce(days,0),'completed_workouts',total,'timezone',coalesce(tz,'America/New_York'),'badges',coalesce((select jsonb_agg(to_jsonb(b)) from public.athlete_badges b where user_id=u),'[]'::jsonb));
end $$;
create function public.records_badge_refresh() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform public.refresh_athlete_badges(case when tg_op='DELETE' then old.user_id else new.user_id end);
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger refresh_record_badges after insert or update or delete on public.athlete_records for each row execute function public.records_badge_refresh();
-- Backfill only verifiable signup/record badges. Login times are not invented.
do $$ declare u record; begin for u in select id from public.profiles loop perform public.refresh_athlete_badges(u.id); end loop; end $$;
revoke all on function public.valid_exercise_definitions(jsonb),public.valid_exercise_entries(jsonb),public.signup_badge_slot(),public.streak_calendar(uuid,date),public.refresh_athlete_badges(uuid),public.records_badge_refresh() from public,anon,authenticated;
grant execute on function public.valid_exercise_definitions(jsonb),public.valid_exercise_entries(jsonb) to authenticated;
revoke all on function public.previous_exercise_performance(text[],uuid),public.record_athlete_activity(text),public.save_badge_profile(text,text,integer[]),public.my_badge_summary() from public,anon;
grant execute on function public.previous_exercise_performance(text[],uuid),public.record_athlete_activity(text),public.save_badge_profile(text,text,integer[]),public.my_badge_summary() to authenticated;
commit;
notify pgrst,'reload schema';
