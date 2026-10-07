-- Apply after the combined Coach update. Existing results and records are preserved.
begin;
create or replace function public.valid_exercise_entries(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare e jsonb; s jsonb; k text; n numeric; seen text[] := '{}'; label_key text; total integer:=0;
begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)>100 then return false; end if;
 for e in select value from jsonb_array_elements(v) loop
  label_key:=lower(regexp_replace(trim(e->>'label'),'\s+',' ','g'));
  if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'id') is distinct from 'string' or length(e->>'id') not between 1 and 100 or jsonb_typeof(e->'label') is distinct from 'string' or length(trim(e->>'label')) not between 1 and 100 or label_key=any(seen) or coalesce(e->>'unit','') not in ('lb','kg') or jsonb_typeof(e->'sets') is distinct from 'array' or jsonb_array_length(e->'sets') not between 1 and 50 then return false; end if;
  seen:=array_append(seen,label_key); total:=total+jsonb_array_length(e->'sets'); if total>500 then return false; end if;
  for s in select value from jsonb_array_elements(e->'sets') loop
   if s ? 'set_type' and coalesce(s->>'set_type','') not in ('working','warmup') then return false; end if;
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
alter table public.plan_results add column if not exists revision bigint not null default 0;
alter table public.results add column if not exists revision bigint not null default 0;
create or replace function public.bump_workout_revision() returns trigger language plpgsql set search_path='' as $$
begin new.revision:=old.revision+1; return new; end $$;
drop trigger if exists workout_revision on public.plan_results;
create trigger workout_revision before update on public.plan_results for each row execute function public.bump_workout_revision();
drop trigger if exists workout_revision on public.results;
create trigger workout_revision before update on public.results for each row execute function public.bump_workout_revision();

create table if not exists public.workout_sync_receipts (
 user_id uuid not null references public.profiles(id) on delete cascade,
 operation_id uuid not null, digest text not null, response jsonb not null,
 created_at timestamptz not null default now(), primary key(user_id,operation_id)
);
alter table public.workout_sync_receipts enable row level security;
revoke all on public.workout_sync_receipts from public,anon,authenticated;

create or replace function public.exercise_history(p_label text default null,p_before timestamptz default null,p_limit integer default 100)
returns table(label_key text,entry jsonb,completed_at timestamptz,source text,result_id uuid)
language sql security invoker set search_path='' as $$
 with history as (
  select lower(regexp_replace(trim(x->>'label'),'\s+',' ','g')) k,x,r.completed_at t,'Program'::text src,r.id
  from public.plan_results r cross join lateral jsonb_array_elements(r.exercise_entries) x where r.user_id=auth.uid()
  union all
  select lower(regexp_replace(trim(x->>'label'),'\s+',' ','g')),x,r.created_at,'Daily WOD',r.id
  from public.results r join public.wod_exercise_logs l on l.result_id=r.id cross join lateral jsonb_array_elements(l.exercise_entries) x where r.user_id=auth.uid()
 ) select k,x,t,src,id from history
 where (p_label is null or k=lower(regexp_replace(trim(p_label),'\s+',' ','g')))
 and (p_before is null or t<p_before)
 and (exists(select 1 from jsonb_array_elements(x->'sets') s where coalesce(s->>'set_type','working')='working' and (s->>'completed')::boolean)
      or (x->>'duration_seconds')::numeric>0 or (x->>'distance')::numeric>0)
 order by t desc,id desc,k limit least(greatest(p_limit,1),1000);
$$;
revoke all on function public.exercise_history(text,timestamptz,integer) from public,anon;
grant execute on function public.exercise_history(text,timestamptz,integer) to authenticated;

-- One shared transactional endpoint for online and offline submissions. Stable operation IDs
-- prevent duplicates; revision checks prevent silently replacing another device's correction.
create or replace function public.sync_workout_event(p_operation uuid,p_event jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); receipt public.workout_sync_receipts; target jsonb:=p_event->'target';
 entries jsonb:=p_event->'entries'; e public.user_plan_enrollments; s public.plan_sessions;
 saved uuid; existing_id uuid; current_revision bigint; old_result jsonb; kind text:=p_event->>'kind';
 item jsonb; st jsonb; key text; kg numeric; best numeric; record_id uuid; achievements jsonb:='[]';
 observed timestamptz:=(p_event->>'observed_at')::timestamptz; achieved date; response jsonb;
begin
 if u is null or p_operation is null then raise exception 'Please sign in to sync workouts'; end if;
 if jsonb_typeof(p_event) is distinct from 'object' or octet_length(p_event::text)>1048576 or coalesce(kind,'') not in ('checkpoint','complete')
 or coalesce(target->>'kind','') not in ('plan','wod') or not public.valid_exercise_entries(entries) then raise exception 'Invalid workout submission'; end if;
 if observed is null or observed>now()+interval '5 minutes' or observed<'2000-01-01' then raise exception 'Check the device date before syncing'; end if;
 achieved:=(observed at time zone 'America/New_York')::date;
 perform pg_advisory_xact_lock(hashtext('workout-sync:'||u::text));
 select * into receipt from public.workout_sync_receipts where user_id=u and operation_id=p_operation;
 if found then
  if receipt.digest<>md5(p_event::text) then raise exception 'This saved operation was changed. Keep the original submission.'; end if;
  return receipt.response;
 end if;
 if target->>'kind'='plan' then
  select * into e from public.user_plan_enrollments where id=(target->>'enrollmentId')::uuid and user_id=u for update;
  if not found then raise exception 'Enrollment not found'; end if;
  select * into s from public.plan_sessions where id=(target->>'sessionId')::uuid and plan_id=e.plan_id;
  if not found or e.plan_id is distinct from (target->>'planId')::uuid then raise exception 'Session is not in your program'; end if;
  if kind='checkpoint' and ((target->>'attempt')::integer<>e.current_attempt or not e.is_following or e.status='paused') then raise exception 'Program changed. Reconnect and refresh before recording new PRs.'; end if;
  select id,revision,to_jsonb(r) into existing_id,current_revision,old_result from public.plan_results r where enrollment_id=e.id and session_id=s.id and attempt=(target->>'attempt')::integer for update;
 else
  if not exists(select 1 from public.workouts where id=(target->>'workoutId')::uuid and (workout_date<=(now() at time zone 'America/New_York')::date or public.staff_can_review())) then raise exception 'Workout not available'; end if;
  select id,revision,to_jsonb(r) into existing_id,current_revision,old_result from public.results r where workout_id=(target->>'workoutId')::uuid and user_id=u for update;
 end if;
 if kind='complete' then
  if nullif(p_event->>'result_id','') is null and existing_id is not null then raise exception 'A result already exists. Your local workout is preserved; review it against the saved result.'; end if;
  if nullif(p_event->>'result_id','') is not null and (existing_id is distinct from (p_event->>'result_id')::uuid or current_revision is distinct from (p_event->>'expected_revision')::bigint) then raise exception 'The result changed on another device. Your local correction is preserved; review it before retrying.'; end if;
  if target->>'kind'='plan' then
   saved:=public.save_training_session_result(e.id,s.id,(target->>'attempt')::integer,p_event->'result'||jsonb_build_object('exercise_entries',entries),p_event->'logs',existing_id);
   if existing_id is null then
    update public.plan_results set completed_at=observed where id=saved;
    update public.training_exercise_logs set created_at=observed where result_id=saved;
   end if;
  else
   saved:=public.save_wod_exercise_result((target->>'workoutId')::uuid,p_event->'result',entries,existing_id);
   if existing_id is null then update public.results set created_at=observed where id=saved; end if;
  end if;
 end if;
 -- Only known, exact exercise identities qualify. Alternatives and estimated maxes do not.
 for item in select value from jsonb_array_elements(entries) loop
  key:=case lower(regexp_replace(trim(item->>'label'),'\s+',' ','g'))
   when 'back squat' then 'squat' when 'barbell back squat' then 'squat'
   when 'deadlift' then 'deadlift' when 'barbell deadlift' then 'deadlift'
   when 'bench press' then 'bench' when 'barbell bench press' then 'bench'
   when 'power clean' then 'power_clean' when 'barbell power clean' then 'power_clean'
   when 'overhead press' then 'overhead_press' when 'barbell overhead press' then 'overhead_press'
   when 'strict press' then 'overhead_press' else null end;
  if key is null then continue; end if;
  select max((v->>'weight')::numeric*case when item->>'unit'='lb' then 1/2.2046226218 else 1 end) into kg
  from jsonb_array_elements(item->'sets') v where (v->>'completed')::boolean and (v->>'reps')::numeric=1
  and coalesce(v->>'set_type','working')='working' and (v->>'weight')::numeric>0;
  if kg is null then continue; end if;
  select max(value*case when unit='lb' then 1/2.2046226218 else 1 end) into best from public.athlete_records where user_id=u and record_key=key;
  if best is null or kg>best+0.0001 then
   insert into public.athlete_records(user_id,record_key,value,unit,achieved_at,notes)
   values(u,key,case when item->>'unit'='lb' then round(kg*2.2046226218,4) else kg end,item->>'unit',achieved,'Automatic completed working single. Operation '||p_operation::text) returning id into record_id;
   achievements:=achievements||jsonb_build_array(jsonb_build_object('id',record_id,'label',item->>'label','value',case when item->>'unit'='lb' then round(kg*2.2046226218,4) else kg end,'unit',item->>'unit'));
  end if;
 end loop;
 response:=jsonb_build_object('saved_id',saved,'prs',achievements);
 insert into public.workout_sync_receipts(user_id,operation_id,digest,response) values(u,p_operation,md5(p_event::text),response);
 return response;
end $$;
revoke all on function public.sync_workout_event(uuid,jsonb) from public,anon;
grant execute on function public.sync_workout_event(uuid,jsonb) to authenticated;

create or replace function public.wod_schedule_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare today date:=(now() at time zone 'America/New_York')::date; first_day date; last_day date; gap date;
begin
 if not public.staff_is_owner() then raise exception 'Owner MFA access required'; end if;
 select min(workout_date),max(workout_date) into first_day,last_day from public.workouts where workout_date>=today and not is_hidden;
 if first_day is not null then
  select d::date into gap from generate_series(first_day,last_day,interval '1 day') d
  where not exists(select 1 from public.workouts w where w.workout_date=d::date and not w.is_hidden) order by d limit 1;
 end if;
 return jsonb_build_object('today',today,'first_day',first_day,'last_day',last_day,'first_gap',gap,'days_left',case when last_day is null then 0 else last_day-today+1 end,
 'warning',last_day is null or last_day-today<=5 or coalesce(gap<=today+5,false));
end $$;
revoke all on function public.wod_schedule_status() from public,anon;
grant execute on function public.wod_schedule_status() to authenticated;
commit;
notify pgrst,'reload schema';
