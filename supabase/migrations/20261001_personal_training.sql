-- Run this entire migration once in Supabase SQL Editor on your existing database.
-- Do NOT rerun schema.sql. This migration preserves existing workouts/results.
begin;

create table public.athlete_records (
 id uuid primary key default uuid_generate_v4(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 record_key text not null check (record_key in ('squat','deadlift','bench','power_clean','overhead_press','mile','5k','2_mile')),
 value numeric not null check (value > 0 and value < 1000000),
 unit text not null check (unit in ('lb','kg','seconds')),
 achieved_at date not null default current_date check (achieved_at <= current_date),
 notes text,
 created_at timestamptz not null default now(),
 check ((record_key in ('mile','5k','2_mile') and unit = 'seconds') or
        (record_key not in ('mile','5k','2_mile') and unit in ('lb','kg')))
);
create index athlete_records_user_key on public.athlete_records(user_id, record_key, achieved_at desc);
alter table public.athlete_records enable row level security;
create policy "Own athlete records" on public.athlete_records for all to authenticated
 using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.athlete_records to authenticated;
revoke all on public.athlete_records from anon;

-- JSON prescriptions are explicitly authored; existing descriptions stay intact.
alter table public.plan_sessions add column prescriptions jsonb not null default '[]'::jsonb;
alter table public.workouts add column prescriptions jsonb not null default '[]'::jsonb;
create function public.valid_training_prescriptions(items jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare x jsonb; seen text[] := '{}';
begin
 if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 40 then return false; end if;
 for x in select value from jsonb_array_elements(items) loop
  if jsonb_typeof(x) <> 'object' or coalesce(x->>'id','') = '' or (x->>'id') = any(seen)
   or coalesce(length(trim(x->>'label')),0) not between 1 and 100
   or coalesce(x->>'record_key','') not in ('squat','deadlift','bench','power_clean','overhead_press','mile','5k','2_mile')
   or coalesce(x->>'unit','') not in ('lb','kg')
   or coalesce(x->>'strategy','') not in ('percent','previous')
   or coalesce((x->>'percent')::numeric,0) not between 1 and 300
   or coalesce((x->>'increment')::numeric,-1) not between 0 and 100
   or coalesce((x->>'rounding')::numeric,0) not between 0.5 and 100
   or coalesce((x->>'sets')::integer,0) not between 1 and 100
   or coalesce((x->>'reps')::integer,0) not between 1 and 1000
  then return false; end if;
  if x->>'record_key' in ('mile','5k','2_mile') and x->>'strategy' <> 'percent' then return false; end if;
  if x->>'record_key' not in ('mile','5k','2_mile') and (x->>'percent')::numeric > 100 then return false; end if;
  if x->>'strategy' = 'previous' and (x->>'increment')::numeric > 0 and mod((x->>'increment')::numeric,(x->>'rounding')::numeric) <> 0 then return false; end if;
  seen := array_append(seen,x->>'id');
 end loop;
 return true;
exception when others then return false;
end $$;
alter table public.plan_sessions add constraint plan_prescriptions_valid check (public.valid_training_prescriptions(prescriptions));
alter table public.workouts add constraint wod_prescriptions_valid check (public.valid_training_prescriptions(prescriptions));

create table public.training_exercise_logs (
 id uuid primary key default uuid_generate_v4(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 enrollment_id uuid not null references public.user_plan_enrollments(id) on delete cascade,
 result_id uuid not null references public.plan_results(id) on delete cascade,
 prescription_id text not null,
 record_key text not null,
 label text not null,
 sets integer not null check (sets > 0),
 reps integer not null check (reps > 0),
 value numeric not null check (value > 0 and value < 1000000),
 unit text not null check (unit in ('lb','kg','seconds')),
 outcome text not null check (outcome in ('comfortable','hard','missed')),
 created_at timestamptz not null default now(),
 unique(result_id, prescription_id)
);
create index training_logs_history on public.training_exercise_logs(user_id,enrollment_id,created_at desc);
alter table public.training_exercise_logs enable row level security;
create policy "View own exercise logs" on public.training_exercise_logs for select to authenticated using (user_id = auth.uid());
create policy "Insert own exercise logs" on public.training_exercise_logs for insert to authenticated with check (
 user_id = auth.uid() and exists(select 1 from public.plan_results r where r.id = result_id and r.user_id = auth.uid() and r.enrollment_id = training_exercise_logs.enrollment_id)
);
grant select, insert on public.training_exercise_logs to authenticated;
revoke all on public.training_exercise_logs from anon;

-- Prevent users assigning themselves admin privileges through the existing profile policy.
revoke insert, update on public.profiles from authenticated, anon;
grant update (display_name, avatar_url) on public.profiles to authenticated;

-- First unfinished session, ordered consistently, including explicit rest days.
create function public.refresh_training_progress(p_enrollment uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare e public.user_plan_enrollments; next_id uuid;
begin
 select * into e from public.user_plan_enrollments where id = p_enrollment and user_id = auth.uid() for update;
 if not found then raise exception 'Enrollment not found'; end if;
 select s.id into next_id from public.plan_sessions s where s.plan_id = e.plan_id
  and not exists(select 1 from public.plan_results r where r.enrollment_id = e.id and r.session_id = s.id)
  order by s.order_index,s.week_number,s.day_number,s.id limit 1;
 update public.user_plan_enrollments set current_session_id = next_id,
  status = case when next_id is null and exists(select 1 from public.plan_sessions where plan_id = e.plan_id) then 'completed' else 'active' end,
  completed_at = case when next_id is null and exists(select 1 from public.plan_sessions where plan_id = e.plan_id) then coalesce(e.completed_at,now()) else null end
 where id = e.id;
end $$;

create function public.enroll_training_plan(p_plan uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare enrollment uuid;
begin
 if auth.uid() is null then raise exception 'Please log in'; end if;
 if not exists(select 1 from public.training_plans where id = p_plan and is_published) then raise exception 'Published plan not found'; end if;
 if not exists(select 1 from public.plan_sessions where plan_id = p_plan) then raise exception 'This plan has no sessions yet'; end if;
 insert into public.user_plan_enrollments(user_id,plan_id,status) values(auth.uid(),p_plan,'active')
 on conflict(user_id,plan_id) do nothing;
 select id into enrollment from public.user_plan_enrollments where user_id = auth.uid() and plan_id = p_plan;
 perform public.refresh_training_progress(enrollment);
 return enrollment;
end $$;

create function public.complete_training_session(p_enrollment uuid,p_session uuid,p_result jsonb,p_logs jsonb default '[]') returns uuid
language plpgsql security invoker set search_path = '' as $$
declare e public.user_plan_enrollments; s public.plan_sessions; result_uuid uuid; item jsonb; prescription jsonb;
begin
 if auth.uid() is null then raise exception 'Please log in'; end if;
 select * into e from public.user_plan_enrollments where id = p_enrollment and user_id = auth.uid() for update;
 if not found then raise exception 'Enrollment not found'; end if;
 select * into s from public.plan_sessions where id = p_session and plan_id = e.plan_id;
 if not found then raise exception 'Session is not in your plan'; end if;
 select id into result_uuid from public.plan_results where enrollment_id = e.id and session_id = s.id;
 if result_uuid is not null then
  perform public.refresh_training_progress(e.id); return result_uuid; -- retry / double tap is safe
 end if;
 if e.status <> 'active' then raise exception 'This enrollment is not active'; end if;
 if (p_result->>'completion_time_seconds')::integer <= 0 or (p_result->>'rounds')::integer < 0 or (p_result->>'extra_reps')::integer < 0 then
  raise exception 'Time must be positive and rounds/reps cannot be negative';
 end if;
 insert into public.plan_results(user_id,enrollment_id,session_id,completion_time_seconds,rounds,extra_reps,weight_used,is_rx,notes)
 values(auth.uid(),e.id,s.id,(p_result->>'completion_time_seconds')::integer,(p_result->>'rounds')::integer,
  (p_result->>'extra_reps')::integer,nullif(p_result->>'weight_used',''),coalesce((p_result->>'is_rx')::boolean,false),nullif(p_result->>'notes',''))
 returning id into result_uuid;
 if jsonb_typeof(p_logs) <> 'array' or jsonb_array_length(p_logs)>40 then raise exception 'Invalid exercise results'; end if;
 for item in select value from jsonb_array_elements(p_logs) loop
  select value into prescription from jsonb_array_elements(s.prescriptions) where value->>'id' = item->>'prescription_id';
  if prescription is null then raise exception 'Unknown exercise prescription'; end if;
  if (item->>'unit') is distinct from (case when prescription->>'record_key' in ('mile','5k','2_mile') then 'seconds' else prescription->>'unit' end) then
   raise exception 'Exercise result unit does not match prescription';
  end if;
  insert into public.training_exercise_logs(user_id,enrollment_id,result_id,prescription_id,record_key,label,sets,reps,value,unit,outcome)
  values(auth.uid(),e.id,result_uuid,item->>'prescription_id',prescription->>'record_key',prescription->>'label',
   (prescription->>'sets')::integer,(prescription->>'reps')::integer,(item->>'value')::numeric,item->>'unit',item->>'outcome');
 end loop;
 perform public.refresh_training_progress(e.id);
 return result_uuid;
end $$;

-- A delete guard must see all users' history, not only the admin's own results.
create function public.protect_logged_training_session() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if exists(select 1 from public.plan_results where session_id=old.id) then
  raise exception 'Cannot delete a session with logged results. Keep the session or create a new plan.';
 end if;
 return old;
end $$;
revoke all on function public.protect_logged_training_session() from public,anon,authenticated;
create trigger protect_logged_training_session before delete on public.plan_sessions
 for each row execute function public.protect_logged_training_session();

-- Atomic admin editing: preserve IDs and forbid deleting sessions with logged history.
-- This admin-only function needs to reconcile all enrolled users and inspect all history.
-- It checks the caller's protected admin flag before any write.
create function public.save_training_program(p_plan_id uuid,p_plan jsonb,p_sessions jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare plan_uuid uuid; item jsonb; session_uuid uuid; kept uuid[] := '{}'; position integer := 0;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_admin) then raise exception 'Admin access required'; end if;
 if coalesce(length(trim(p_plan->>'title')),0)=0 then raise exception 'Plan title required'; end if;
 if jsonb_typeof(p_sessions)<>'array' or jsonb_array_length(p_sessions)>1000 then raise exception 'Invalid sessions'; end if;
 if p_plan_id is null then
  insert into public.training_plans(title,description,goal,duration_weeks,difficulty,tags,is_published,created_by)
  values(p_plan->>'title',p_plan->>'description',p_plan->>'goal',(p_plan->>'duration_weeks')::integer,p_plan->>'difficulty',
   array(select jsonb_array_elements_text(coalesce(p_plan->'tags','[]'))),(p_plan->>'is_published')::boolean,auth.uid()) returning id into plan_uuid;
 else
  plan_uuid := p_plan_id;
  perform 1 from public.training_plans where id=plan_uuid for update;
  if not found then raise exception 'Plan not found'; end if;
  update public.training_plans set title=p_plan->>'title',description=p_plan->>'description',goal=p_plan->>'goal',
   duration_weeks=(p_plan->>'duration_weeks')::integer,difficulty=p_plan->>'difficulty',
   tags=array(select jsonb_array_elements_text(coalesce(p_plan->'tags','[]'))),is_published=(p_plan->>'is_published')::boolean,updated_at=now()
  where id=plan_uuid;
 end if;
 for item in select value from jsonb_array_elements(p_sessions) loop
  session_uuid := nullif(item->>'id','')::uuid;
  if session_uuid is not null then
   if session_uuid=any(kept) then raise exception 'Duplicate session'; end if;
   update public.plan_sessions set week_number=(item->>'week_number')::integer,day_number=(item->>'day_number')::integer,
    title=item->>'title',description=item->>'description',session_type=item->>'session_type',estimated_minutes=(item->>'estimated_minutes')::integer,
    notes=item->>'notes',order_index=position,prescriptions=coalesce(item->'prescriptions','[]'),updated_at=now()
   where id=session_uuid and plan_id=plan_uuid;
   if not found then raise exception 'Session does not belong to this plan'; end if;
  else
   insert into public.plan_sessions(plan_id,week_number,day_number,title,description,session_type,estimated_minutes,notes,order_index,prescriptions)
   values(plan_uuid,(item->>'week_number')::integer,(item->>'day_number')::integer,item->>'title',item->>'description',item->>'session_type',
    (item->>'estimated_minutes')::integer,item->>'notes',position,coalesce(item->'prescriptions','[]')) returning id into session_uuid;
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
   and not exists(select 1 from public.plan_results r where r.enrollment_id=e.id and r.session_id=s.id)
   order by s.order_index,s.week_number,s.day_number,s.id limit 1
 ) where e.plan_id=plan_uuid;
 update public.user_plan_enrollments set
  status=case when status='paused' then 'paused' when current_session_id is null and exists(select 1 from public.plan_sessions where plan_id=plan_uuid) then 'completed' else 'active' end,
  completed_at=case when current_session_id is null and exists(select 1 from public.plan_sessions where plan_id=plan_uuid) then coalesce(completed_at,now()) else null end
 where plan_id=plan_uuid;
 return plan_uuid;
end $$;

-- Restrict RPC execution to signed-in users. User-facing progress functions respect RLS; admin editing checks the protected admin flag.
revoke all on function public.refresh_training_progress(uuid),public.enroll_training_plan(uuid),public.complete_training_session(uuid,uuid,jsonb,jsonb),public.save_training_program(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.refresh_training_progress(uuid),public.enroll_training_plan(uuid),public.complete_training_session(uuid,uuid,jsonb,jsonb),public.save_training_program(uuid,jsonb,jsonb) to authenticated;

-- Reconcile existing enrollment pointers without deleting any history.
update public.user_plan_enrollments e set current_session_id=(
 select s.id from public.plan_sessions s where s.plan_id=e.plan_id
 and not exists(select 1 from public.plan_results r where r.enrollment_id=e.id and r.session_id=s.id)
 order by s.order_index,s.week_number,s.day_number,s.id limit 1
) where status='active';
update public.user_plan_enrollments e set status='completed',completed_at=coalesce(completed_at,now())
where status='active' and current_session_id is null and exists(select 1 from public.plan_sessions where plan_id=e.plan_id);

notify pgrst,'reload schema';
commit;
