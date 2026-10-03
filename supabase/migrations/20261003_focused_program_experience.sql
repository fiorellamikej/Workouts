-- Apply after program overview. Leaving preserves enrollment, attempts, and all results.
begin;
alter table public.user_plan_enrollments add column is_following boolean not null default true;
create function public.leave_training_program(p_enrollment uuid,p_expected_attempt integer) returns void
language plpgsql security invoker set search_path = '' as $$
declare e public.user_plan_enrollments;
begin
 select * into e from public.user_plan_enrollments where id=p_enrollment and user_id=auth.uid() for update;
 if not found then raise exception 'Enrollment not found'; end if;
 if e.current_attempt is distinct from p_expected_attempt then raise exception 'Program changed. Refresh before leaving.'; end if;
 update public.user_plan_enrollments set is_following=false,status=case when status='completed' then 'completed' else 'paused' end where id=e.id;
end $$;
create or replace function public.enroll_training_plan(p_plan uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare enrollment uuid;
begin
 if auth.uid() is null then raise exception 'Please log in'; end if;
 if not exists(select 1 from public.training_plans where id = p_plan and is_published) then raise exception 'Published plan not found'; end if;
 if not exists(select 1 from public.plan_sessions where plan_id = p_plan) then raise exception 'This plan has no sessions yet'; end if;
 insert into public.user_plan_enrollments(user_id,plan_id,status,is_following) values(auth.uid(),p_plan,'active',true)
 on conflict(user_id,plan_id) do nothing;
 select id into enrollment from public.user_plan_enrollments where user_id=auth.uid() and plan_id=p_plan for update;
 update public.user_plan_enrollments set is_following=true,status=case when not is_following and status='paused' then 'active' else status end where id=enrollment;
 perform public.refresh_training_progress(enrollment);
 return enrollment;
end $$;
revoke all on function public.leave_training_program(uuid,integer),public.enroll_training_plan(uuid) from public,anon;
grant execute on function public.leave_training_program(uuid,integer),public.enroll_training_plan(uuid) to authenticated;
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

create or replace function public.select_training_day(p_enrollment uuid,p_session uuid,p_attempt integer) returns void
language plpgsql security invoker set search_path='' as $$
declare e public.user_plan_enrollments;
begin
 select * into e from public.user_plan_enrollments where id=p_enrollment and user_id=auth.uid() for update;
 if not found then raise exception 'Enrollment not found'; end if;
 if not e.is_following then raise exception 'Rejoin this program before changing progress'; end if;
 if p_attempt is distinct from e.current_attempt then raise exception 'Program was restarted. Refresh before changing days.'; end if;
 if not exists(select 1 from public.plan_sessions where id=p_session and plan_id=e.plan_id) then raise exception 'Day is not in this program'; end if;
 update public.user_plan_enrollments set current_session_id=p_session where id=e.id;
end $$;

create or replace function public.restart_training_program(p_enrollment uuid,p_expected_attempt integer) returns integer
language plpgsql security invoker set search_path='' as $$
declare e public.user_plan_enrollments; first_id uuid;
begin
 select * into e from public.user_plan_enrollments where id=p_enrollment and user_id=auth.uid() for update;
 if not found then raise exception 'Enrollment not found'; end if;
 if not e.is_following then raise exception 'Rejoin this program before changing progress'; end if;
 if p_expected_attempt is distinct from e.current_attempt then raise exception 'Program already changed. Refresh before restarting again.'; end if;
 select id into first_id from public.plan_sessions where plan_id=e.plan_id order by order_index,week_number,day_number,id limit 1;
 if first_id is null then raise exception 'This plan has no sessions'; end if;
 update public.user_plan_enrollments set current_attempt=current_attempt+1,current_session_id=first_id,status='active',started_at=current_date,completed_at=null where id=e.id;
 return e.current_attempt+1;
end $$;

create or replace function public.undo_training_completion(p_enrollment uuid,p_result_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare e public.user_plan_enrollments; r public.plan_results;
begin
 select * into e from public.user_plan_enrollments where id=p_enrollment and user_id=auth.uid() for update;
 if not found then raise exception 'Enrollment not found'; end if;
 if not e.is_following then raise exception 'Rejoin this program before changing progress'; end if;
 select * into r from public.plan_results where id=p_result_id and enrollment_id=e.id and user_id=auth.uid() for update;
 if not found then return; end if;
 if r.attempt<>e.current_attempt then raise exception 'Use Edit Result to correct a previous run. Undo Completion is available for the current run.'; end if;
 delete from public.plan_results where id=r.id;
 if r.attempt=e.current_attempt then
  perform public.refresh_training_progress(e.id);
  update public.user_plan_enrollments set current_session_id=r.session_id where id=e.id;
 end if;
end $$;
commit;
notify pgrst,'reload schema';
