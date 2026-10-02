-- Apply AFTER 20261001_personal_training.sql. Run this NEW migration once.
begin;
alter table public.user_plan_enrollments add column current_attempt integer not null default 1 check (current_attempt>0);
alter table public.plan_results add column attempt integer not null default 1 check (attempt>0);
alter table public.plan_results add column prescriptions_snapshot jsonb not null default '[]';
update public.plan_results r set prescriptions_snapshot=s.prescriptions from public.plan_sessions s where s.id=r.session_id;
-- Preserve metadata from old exercise logs if their target was changed or removed before this upgrade.
do $$
declare r record; l record; rules jsonb; recipe jsonb; location integer; metadata jsonb;
begin
 for r in select id,prescriptions_snapshot from public.plan_results loop
  rules:=r.prescriptions_snapshot;
  for l in select * from public.training_exercise_logs where result_id=r.id loop
   select (ordinality-1)::integer,value into location,recipe from jsonb_array_elements(rules) with ordinality where value->>'id'=l.prescription_id;
   metadata:=jsonb_build_object('id',l.prescription_id,'label',l.label,'record_key',l.record_key,'sets',l.sets,'reps',l.reps,'unit',case when l.unit='seconds' then 'lb' else l.unit end);
   if location is null then
    rules:=rules||jsonb_build_array(jsonb_build_object('percent',70,'strategy','percent','increment',0,'rounding',case when l.unit='kg' then 2.5 else 5 end)||metadata);
   else
    rules:=jsonb_set(rules,array[location::text],recipe||metadata);
   end if;
  end loop;
  update public.plan_results set prescriptions_snapshot=rules where id=r.id;
 end loop;
end $$;
alter table public.plan_results drop constraint plan_results_user_id_session_id_key;
alter table public.plan_results add constraint plan_result_per_attempt unique(enrollment_id,attempt,session_id);
create index plan_results_attempt on public.plan_results(enrollment_id,attempt);

-- Snapshots record the prescription actually logged, even if the admin edits the plan later.
create policy "Update own exercise logs" on public.training_exercise_logs for update to authenticated
 using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "Delete own exercise logs" on public.training_exercise_logs for delete to authenticated using(user_id=auth.uid());
grant update,delete on public.training_exercise_logs to authenticated;

create or replace function public.refresh_training_progress(p_enrollment uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare e public.user_plan_enrollments; next_id uuid;
begin
 select * into e from public.user_plan_enrollments where id=p_enrollment and user_id=auth.uid() for update;
 if not found then raise exception 'Enrollment not found'; end if;
 select s.id into next_id from public.plan_sessions s where s.plan_id=e.plan_id
  and not exists(select 1 from public.plan_results r where r.enrollment_id=e.id and r.attempt=e.current_attempt and r.session_id=s.id)
  order by s.order_index,s.week_number,s.day_number,s.id limit 1;
 update public.user_plan_enrollments set current_session_id=next_id,
  status=case when next_id is null and exists(select 1 from public.plan_sessions where plan_id=e.plan_id) then 'completed' else 'active' end,
  completed_at=case when next_id is null and exists(select 1 from public.plan_sessions where plan_id=e.plan_id) then coalesce(e.completed_at,now()) else null end
 where id=e.id;
end $$;

create function public.save_training_session_result(p_enrollment uuid,p_session uuid,p_attempt integer,p_result jsonb,p_logs jsonb,p_result_id uuid default null) returns uuid
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
  if e.status='paused' then raise exception 'Resume this program before logging a new result'; end if;
  rules:=s.prescriptions;
 end if;
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
 return saved.id;
end $$;

-- Compatibility for the old UI only on its original run; stale pages cannot log into a restarted run.
create or replace function public.complete_training_session(p_enrollment uuid,p_session uuid,p_result jsonb,p_logs jsonb default '[]') returns uuid
language plpgsql security invoker set search_path='' as $$
declare e public.user_plan_enrollments;
begin
 select * into e from public.user_plan_enrollments where id=p_enrollment and user_id=auth.uid() for update;
 if not found then raise exception 'Enrollment not found'; end if;
 if e.current_attempt<>1 then raise exception 'Please refresh to use the updated program controls'; end if;
 return public.save_training_session_result(p_enrollment,p_session,1,p_result,p_logs,null);
end $$;

create function public.undo_training_completion(p_enrollment uuid,p_result_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare e public.user_plan_enrollments; r public.plan_results;
begin
 select * into e from public.user_plan_enrollments where id=p_enrollment and user_id=auth.uid() for update;
 if not found then raise exception 'Enrollment not found'; end if;
 select * into r from public.plan_results where id=p_result_id and enrollment_id=e.id and user_id=auth.uid() for update;
 if not found then return; end if;
 if r.attempt<>e.current_attempt then raise exception 'Use Edit Result to correct a previous run. Undo Completion is available for the current run.'; end if;
 delete from public.plan_results where id=r.id;
 if r.attempt=e.current_attempt then
  perform public.refresh_training_progress(e.id);
  update public.user_plan_enrollments set current_session_id=r.session_id where id=e.id;
 end if;
end $$;

create function public.select_training_day(p_enrollment uuid,p_session uuid,p_attempt integer) returns void
language plpgsql security invoker set search_path='' as $$
declare e public.user_plan_enrollments;
begin
 select * into e from public.user_plan_enrollments where id=p_enrollment and user_id=auth.uid() for update;
 if not found then raise exception 'Enrollment not found'; end if;
 if p_attempt is distinct from e.current_attempt then raise exception 'Program was restarted. Refresh before changing days.'; end if;
 if not exists(select 1 from public.plan_sessions where id=p_session and plan_id=e.plan_id) then raise exception 'Day is not in this program'; end if;
 update public.user_plan_enrollments set current_session_id=p_session where id=e.id;
end $$;

create function public.restart_training_program(p_enrollment uuid,p_expected_attempt integer) returns integer
language plpgsql security invoker set search_path='' as $$
declare e public.user_plan_enrollments; first_id uuid;
begin
 select * into e from public.user_plan_enrollments where id=p_enrollment and user_id=auth.uid() for update;
 if not found then raise exception 'Enrollment not found'; end if;
 if p_expected_attempt is distinct from e.current_attempt then raise exception 'Program already changed. Refresh before restarting again.'; end if;
 select id into first_id from public.plan_sessions where plan_id=e.plan_id order by order_index,week_number,day_number,id limit 1;
 if first_id is null then raise exception 'This plan has no sessions'; end if;
 update public.user_plan_enrollments set current_attempt=current_attempt+1,current_session_id=first_id,status='active',started_at=current_date,completed_at=null where id=e.id;
 return e.current_attempt+1;
end $$;

-- Explicit, title-confirmed admin deletion removes this plan's sessions/enrollments/results only.
create function public.delete_training_program(p_plan uuid,p_confirmation text) returns void
language plpgsql security definer set search_path='' as $$
declare plan_title text;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_admin) then raise exception 'Admin access required'; end if;
 select title into plan_title from public.training_plans where id=p_plan for update;
 if not found then raise exception 'Plan not found'; end if;
 if p_confirmation is distinct from plan_title then raise exception 'Type the exact plan title to confirm deletion'; end if;
 -- Clear result history first; the existing session guard otherwise correctly blocks deletion.
 delete from public.plan_results where enrollment_id in (select id from public.user_plan_enrollments where plan_id=p_plan)
  or session_id in (select id from public.plan_sessions where plan_id=p_plan);
 delete from public.user_plan_enrollments where plan_id=p_plan;
 delete from public.training_plans where id=p_plan;
end $$;

-- Existing admin editing now reconciles only the current run.
create or replace function public.save_training_program(p_plan_id uuid,p_plan jsonb,p_sessions jsonb) returns uuid
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
   and not exists(select 1 from public.plan_results r where r.enrollment_id=e.id and r.attempt=e.current_attempt and r.session_id=s.id)
   order by s.order_index,s.week_number,s.day_number,s.id limit 1
 ) where e.plan_id=plan_uuid;
 update public.user_plan_enrollments set
  status=case when status='paused' then 'paused' when current_session_id is null and exists(select 1 from public.plan_sessions where plan_id=plan_uuid) then 'completed' else 'active' end,
  completed_at=case when current_session_id is null and exists(select 1 from public.plan_sessions where plan_id=plan_uuid) then coalesce(completed_at,now()) else null end
 where plan_id=plan_uuid;
 return plan_uuid;
end $$;

revoke all on function public.save_training_session_result(uuid,uuid,integer,jsonb,jsonb,uuid),public.undo_training_completion(uuid,uuid),public.select_training_day(uuid,uuid,integer),public.restart_training_program(uuid,integer),public.delete_training_program(uuid,text) from public,anon;
grant execute on function public.save_training_session_result(uuid,uuid,integer,jsonb,jsonb,uuid),public.undo_training_completion(uuid,uuid),public.select_training_day(uuid,uuid,integer),public.restart_training_program(uuid,integer),public.delete_training_program(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
