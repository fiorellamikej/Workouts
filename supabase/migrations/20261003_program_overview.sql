-- Apply AFTER the previous training migrations. Adds overview metadata; preserves plans and results.
begin;
create function public.valid_plan_equipment(items text[]) returns boolean
language sql immutable set search_path = '' as $$
 select cardinality(items) <= 30 and not exists(
  select 1 from unnest(items) entry where entry is null or length(trim(entry)) not between 1 and 100
 );
$$;
alter table public.training_plans
 add column equipment_required text[] not null default '{}',
 add column equipment_suggested text[] not null default '{}',
 add column fitness_guidance text,
 add constraint required_equipment_valid check (public.valid_plan_equipment(equipment_required)),
 add constraint suggested_equipment_valid check (public.valid_plan_equipment(equipment_suggested)),
 add constraint fitness_guidance_valid check (fitness_guidance is null or length(fitness_guidance) <= 2000);
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

revoke all on function public.save_training_program(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_training_program(uuid,jsonb,jsonb) to authenticated;
commit;
notify pgrst,'reload schema';
