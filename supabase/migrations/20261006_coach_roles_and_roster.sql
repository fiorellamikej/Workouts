begin;
-- Atomic combined installer. Existing staff roles/assignments are never reset.
do $combined_staff$
begin
 if to_regclass('public.staff_roles') is null then
  execute $roles_sql$
-- Existing admins remain owners; nobody receives staff access from signup metadata.
create table public.staff_roles(user_id uuid primary key references public.profiles(id) on delete cascade,role text not null check(role in ('member','coach','owner')));
insert into public.staff_roles select id,'owner' from public.profiles where is_admin=true;
alter table public.staff_roles enable row level security;
revoke all on public.staff_roles from public,anon,authenticated;
create function public.my_staff_role() returns text language sql stable security definer set search_path='' as $$ select coalesce((select role from public.staff_roles where user_id=auth.uid()),'member') $$;
create function public.staff_is_owner() returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and public.my_staff_role()='owner' and coalesce(auth.jwt()->>'aal','aal1')='aal2' $$;
create function public.staff_can_review() returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and public.my_staff_role() in ('coach','owner') and coalesce(auth.jwt()->>'aal','aal1')='aal2' $$;
create table public.staff_audit(id uuid primary key default gen_random_uuid(),actor_id uuid references public.profiles(id) on delete set null,action text not null,target_id uuid,before_data jsonb,after_data jsonb,reason text,created_at timestamptz not null default now());
alter table public.staff_audit enable row level security;
revoke all on public.staff_audit from public,anon,authenticated;
grant select on public.staff_audit to authenticated;
create policy owner_audit on public.staff_audit for select to authenticated using(public.staff_is_owner());
create function public.search_role_accounts(p_query text) returns table(user_id uuid,email text,display_name text,role text) language plpgsql security definer set search_path='' as $$
begin
 if not public.staff_is_owner() then raise exception 'Owner access required.'; end if;
 if p_query is null or length(trim(p_query))<2 or length(p_query)>150 then return; end if;
 return query select r.user_id,r.email,p.display_name,coalesce(s.role,'member') from public.registration_log r join public.profiles p on p.id=r.user_id left join public.staff_roles s on s.user_id=r.user_id where starts_with(lower(r.email),lower(trim(p_query))) order by r.email limit 10;
end $$;
create function public.assign_staff_role(p_user uuid,p_role text,p_expected text) returns void language plpgsql security definer set search_path='' as $$
declare old_role text;
begin
 perform pg_advisory_xact_lock(6100601);
 if not public.staff_is_owner() then raise exception 'Owner access required.'; end if;
 if p_role is null or p_role not in ('member','coach','owner') then raise exception 'Invalid role.'; end if;
 if not exists(select 1 from public.registration_log where user_id=p_user) then raise exception 'Select an existing account.'; end if;
 select coalesce((select role from public.staff_roles where user_id=p_user),'member') into old_role;
 if old_role is distinct from p_expected then raise exception 'Role changed. Search again.'; end if;
 if old_role='owner' and p_role<>'owner' and (select count(*) from public.staff_roles where role='owner')<=1 then raise exception 'Keep at least one owner.'; end if;
 insert into public.staff_roles values(p_user,p_role) on conflict(user_id) do update set role=excluded.role;
 update public.profiles set is_admin=(p_role='owner') where id=p_user;
 insert into public.staff_audit(actor_id,action,target_id,before_data,after_data) values(auth.uid(),'assign_role',p_user,jsonb_build_object('role',old_role),jsonb_build_object('role',p_role));
end $$;
-- Existing admin writes keep their owner-only checks. Coaches never receive is_admin.
create or replace function public.support_is_admin() returns boolean language sql stable security definer set search_path='' as $$ select public.staff_is_owner() $$;
create policy staff_plan_mfa_read on public.training_plans as restrictive for select to authenticated using(is_published or public.staff_can_review());
create policy staff_workout_mfa_read on public.workouts as restrictive for select to authenticated using(workout_date<=public.daily_wod_today() or public.staff_can_review());
create policy staff_plan_read on public.training_plans for select to authenticated using(public.staff_can_review());
create policy staff_session_read on public.plan_sessions for select to authenticated using(public.staff_can_review());
create policy staff_workout_read on public.workouts for select to authenticated using(public.staff_can_review());
create policy staff_feedback_read on public.feedback_reports for select to authenticated using(public.staff_can_review());
alter table public.training_plans add column is_hidden boolean not null default false;
alter table public.workouts add column is_hidden boolean not null default false;
create function public.set_content_hidden(p_kind text,p_id uuid,p_hidden boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare old_value boolean;
begin
 if not public.staff_can_review() then raise exception 'Staff access required.'; end if;
 if p_hidden is null or p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'Give a reason (3-500 characters).'; end if;
 if p_kind='plan' then
 select is_hidden into old_value from public.training_plans where id=p_id for update;
 if not found then raise exception 'Plan not found.'; end if;
 update public.training_plans set is_hidden=p_hidden where id=p_id;
 elsif p_kind='workout' then
 select is_hidden into old_value from public.workouts where id=p_id for update;
 if not found then raise exception 'Workout not found.'; end if;
 update public.workouts set is_hidden=p_hidden where id=p_id;
 else raise exception 'Invalid content type.'; end if;
 insert into public.staff_audit(actor_id,action,target_id,before_data,after_data,reason) values(auth.uid(),'visibility_'||p_kind,p_id,jsonb_build_object('hidden',old_value),jsonb_build_object('hidden',p_hidden),trim(p_reason));
end $$;
create table public.plan_day_suggestions(id uuid primary key default gen_random_uuid(),session_id uuid not null references public.plan_sessions(id) on delete cascade,author_id uuid references public.profiles(id) on delete set null,body text not null check(length(body) between 3 and 4000),session_snapshot jsonb not null,status text not null default 'open' check(status in ('open','accepted','declined')),owner_response text,created_at timestamptz not null default now(),reviewed_at timestamptz);
alter table public.plan_day_suggestions enable row level security;
revoke all on public.plan_day_suggestions from public,anon,authenticated;
grant select on public.plan_day_suggestions to authenticated;
create policy staff_suggestions_read on public.plan_day_suggestions for select to authenticated using(public.staff_can_review());
create function public.add_day_suggestion(p_session uuid,p_body text) returns void language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;
begin
 if not public.staff_can_review() then raise exception 'Staff access required.'; end if;
 if p_body is null or length(trim(p_body)) not between 3 and 4000 then raise exception 'Enter 3-4000 characters.'; end if;
 select to_jsonb(s) into snapshot from public.plan_sessions s where id=p_session;
 if snapshot is null then raise exception 'Session not found.'; end if;
 insert into public.plan_day_suggestions(session_id,author_id,body,session_snapshot) values(p_session,auth.uid(),trim(p_body),snapshot);
end $$;
create function public.review_day_suggestion(p_id uuid,p_status text,p_response text) returns void language plpgsql security definer set search_path='' as $$
declare old_data jsonb;
begin
 if not public.staff_is_owner() then raise exception 'Owner access required.'; end if;
 if p_status is null or p_status not in ('open','accepted','declined') or length(coalesce(p_response,''))>4000 then raise exception 'Invalid review.'; end if;
 select to_jsonb(s) into old_data from public.plan_day_suggestions s where id=p_id for update;
 if old_data is null then raise exception 'Suggestion not found.'; end if;
 update public.plan_day_suggestions set status=p_status,owner_response=p_response,reviewed_at=now() where id=p_id;
 insert into public.staff_audit(actor_id,action,target_id,before_data,after_data) values(auth.uid(),'review_suggestion',p_id,old_data,jsonb_build_object('status',p_status,'response',p_response));
end $$;
-- Coach review marks are independent of the owner's resolution queue.
create table public.coach_feedback_reviews(report_id uuid references public.feedback_reports(id) on delete cascade,coach_id uuid references public.profiles(id) on delete cascade,notes text not null check(length(notes) between 3 and 4000),reviewed_at timestamptz not null default now(),primary key(report_id,coach_id));
alter table public.coach_feedback_reviews enable row level security;
revoke all on public.coach_feedback_reviews from public,anon,authenticated;
grant select on public.coach_feedback_reviews to authenticated;
create policy staff_feedback_reviews_read on public.coach_feedback_reviews for select to authenticated using(public.staff_can_review());
create function public.review_coach_feedback(p_report uuid,p_notes text) returns void language plpgsql security definer set search_path='' as $$
declare previous jsonb;
begin
 if not public.staff_can_review() then raise exception 'Staff access required.'; end if;
 if p_notes is null or length(trim(p_notes)) not between 3 and 4000 then raise exception 'Enter review notes.'; end if;
 select to_jsonb(r) into previous from public.coach_feedback_reviews r where report_id=p_report and coach_id=auth.uid();
 insert into public.coach_feedback_reviews values(p_report,auth.uid(),trim(p_notes),now()) on conflict(report_id,coach_id) do update set notes=excluded.notes,reviewed_at=excluded.reviewed_at;
 insert into public.staff_audit(actor_id,action,target_id,before_data,after_data) values(auth.uid(),'coach_feedback_review',p_report,previous,jsonb_build_object('notes',trim(p_notes)));
end $$;
create table public.coach_plan_drafts(id uuid primary key default gen_random_uuid(),author_id uuid references public.profiles(id) on delete set null,source_plan_id uuid references public.training_plans(id) on delete set null,plan jsonb not null,sessions jsonb not null,status text not null default 'draft' check(status in ('draft','submitted','approved','declined')),approved_plan_id uuid references public.training_plans(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table public.coach_plan_drafts enable row level security;
revoke all on public.coach_plan_drafts from public,anon,authenticated;
grant select on public.coach_plan_drafts to authenticated;
create policy coach_draft_read on public.coach_plan_drafts for select to authenticated using(public.staff_is_owner() or (public.staff_can_review() and author_id=auth.uid()));
create function public.save_coach_training_draft(p_plan_id uuid,p_plan jsonb,p_sessions jsonb,p_source uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 if not public.staff_can_review() then raise exception 'Staff access required.'; end if;
 if jsonb_typeof(p_plan) is distinct from 'object' or jsonb_typeof(p_sessions) is distinct from 'array' or jsonb_array_length(p_sessions)>1000 or length(p_plan::text)+length(p_sessions::text)>2000000 or coalesce(length(trim(p_plan->>'title')),0) not between 1 and 200 then raise exception 'Invalid draft.'; end if;
 if p_plan_id is null then
 insert into public.coach_plan_drafts(author_id,source_plan_id,plan,sessions) values(auth.uid(),p_source,p_plan||'{"is_published":false}',p_sessions) returning id into rid;
 else
 update public.coach_plan_drafts set plan=p_plan||'{"is_published":false}',sessions=p_sessions,status='draft',updated_at=now() where id=p_plan_id and author_id=auth.uid() and status in ('draft','declined') returning id into rid;
 if rid is null then raise exception 'Only your own unpublished draft can be edited.'; end if;
 end if;
 return rid;
end $$;
create function public.submit_coach_draft(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.staff_can_review() then raise exception 'Staff access required.'; end if;
 update public.coach_plan_drafts set status='submitted',updated_at=now() where id=p_id and author_id=auth.uid() and status='draft';
 if not found then raise exception 'Draft not editable.'; end if;
end $$;
create function public.decide_coach_draft(p_id uuid,p_approve boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.coach_plan_drafts; rid uuid; clean_sessions jsonb;
begin
 if not public.staff_is_owner() then raise exception 'Owner access required.'; end if;
 select * into d from public.coach_plan_drafts where id=p_id and status='submitted' for update;
 if not found then raise exception 'Submitted draft not found.'; end if;
 if p_approve is null then raise exception 'Choose a decision.'; end if;
 if p_approve then
 select coalesce(jsonb_agg(value-'id'),'[]') into clean_sessions from jsonb_array_elements(d.sessions);
 rid:=public.save_training_program(null,d.plan||'{"is_published":false}',clean_sessions);
 end if;
 update public.coach_plan_drafts set status=case when p_approve then 'approved' else 'declined' end,approved_plan_id=rid,updated_at=now() where id=p_id;
 insert into public.staff_audit(actor_id,action,target_id,before_data,after_data) values(auth.uid(),'decide_draft',p_id,to_jsonb(d),jsonb_build_object('approved',p_approve,'new_plan',rid));
 return rid;
end $$;
create or replace function public.delete_training_program(p_plan uuid,p_confirmation text) returns void language plpgsql security definer set search_path='' as $$
declare title text;
begin
 if not public.staff_is_owner() then raise exception 'Owner access required.'; end if;
 select p.title into title from public.training_plans p where id=p_plan for update;
 if not found then raise exception 'Plan not found.'; end if;
 if p_confirmation is distinct from title then raise exception 'Type the exact plan title.'; end if;
 if exists(select 1 from public.plan_results r join public.plan_sessions s on s.id=r.session_id where s.plan_id=p_plan) then raise exception 'This plan has results. Hide it instead.'; end if;
 delete from public.training_plans where id=p_plan;
end $$;
-- Archive populated content instead of deleting athletes' results, even as owner.
create function public.protect_recorded_content() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_NAME='training_plans' and exists(select 1 from public.plan_results r join public.plan_sessions s on s.id=r.session_id where s.plan_id=OLD.id) then raise exception 'This plan has results. Hide it instead.'; end if;
 if TG_TABLE_NAME='plan_sessions' and exists(select 1 from public.plan_results where session_id=OLD.id) then raise exception 'This day has results. Preserve it and create a revised plan.'; end if;
 if TG_TABLE_NAME='workouts' and exists(select 1 from public.results where workout_id=OLD.id) then raise exception 'This workout has results. Hide it instead.'; end if;
 return OLD;
end $$;
create trigger protect_plan_results before delete on public.training_plans for each row execute function public.protect_recorded_content();
create trigger protect_session_results before delete on public.plan_sessions for each row execute function public.protect_recorded_content();
create trigger protect_wod_results before delete on public.workouts for each row execute function public.protect_recorded_content();
-- Owner-only legacy writes also require MFA. Foreign-key anonymization on account deletion is allowed.
create function public.guard_staff_content() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return coalesce(NEW,OLD); end if;
 if TG_OP='UPDATE' and TG_TABLE_NAME<>'plan_sessions' then
 if to_jsonb(NEW)-'created_by' is not distinct from to_jsonb(OLD)-'created_by' and NEW.created_by is null then return NEW; end if;
 end if;
 if TG_OP='UPDATE' and TG_TABLE_NAME<>'plan_sessions' and to_jsonb(NEW)-'is_hidden' is not distinct from to_jsonb(OLD)-'is_hidden' and public.staff_can_review() then return NEW; end if;
 if not public.staff_is_owner() then raise exception 'Owner access and two-factor verification required.'; end if;
 return coalesce(NEW,OLD);
end $$;
create trigger guard_staff_plan before insert or update or delete on public.training_plans for each row execute function public.guard_staff_content();
create trigger guard_staff_session before insert or update or delete on public.plan_sessions for each row execute function public.guard_staff_content();
create trigger guard_staff_workout before insert or update or delete on public.workouts for each row execute function public.guard_staff_content();
-- Keep a complete before/after record of program changes and deletions.
create function public.audit_program_content() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.staff_audit(actor_id,action,target_id,before_data,after_data) values(auth.uid(),TG_TABLE_NAME||'_'||lower(TG_OP),coalesce(NEW.id,OLD.id),case when TG_OP<>'INSERT' then to_jsonb(OLD) end,case when TG_OP<>'DELETE' then to_jsonb(NEW) end);
 return coalesce(NEW,OLD);
end $$;
create trigger audit_plans after insert or update or delete on public.training_plans for each row execute function public.audit_program_content();
create trigger audit_sessions after insert or update or delete on public.plan_sessions for each row execute function public.audit_program_content();
create trigger audit_wods after insert or update or delete on public.workouts for each row execute function public.audit_program_content();
-- Explicit grants: no public execution of privileged staff RPCs.
revoke all on function public.my_staff_role(),public.staff_is_owner(),public.staff_can_review(),public.search_role_accounts(text),public.assign_staff_role(uuid,text,text),public.set_content_hidden(text,uuid,boolean,text),public.add_day_suggestion(uuid,text),public.review_day_suggestion(uuid,text,text),public.review_coach_feedback(uuid,text),public.save_coach_training_draft(uuid,jsonb,jsonb,uuid),public.submit_coach_draft(uuid),public.decide_coach_draft(uuid,boolean) from public,anon;
grant execute on function public.my_staff_role(),public.staff_is_owner(),public.staff_can_review(),public.search_role_accounts(text),public.assign_staff_role(uuid,text,text),public.set_content_hidden(text,uuid,boolean,text),public.add_day_suggestion(uuid,text),public.review_day_suggestion(uuid,text,text),public.review_coach_feedback(uuid,text),public.save_coach_training_draft(uuid,jsonb,jsonb,uuid),public.submit_coach_draft(uuid),public.decide_coach_draft(uuid,boolean) to authenticated;
revoke all on function public.protect_recorded_content(),public.audit_program_content(),public.guard_staff_content() from public,anon,authenticated;
create function public.keep_last_owner() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(6100601);
 if OLD.role='owner' and (select count(*) from public.staff_roles where role='owner')<=1 then raise exception 'Assign another owner before deleting this account.'; end if;
 return OLD;
end $$;
create trigger keep_last_owner before delete on public.staff_roles for each row execute function public.keep_last_owner();
revoke all on function public.keep_last_owner() from public,anon,authenticated;
create table public.coach_workout_drafts(id uuid primary key default gen_random_uuid(),author_id uuid references public.profiles(id) on delete set null,workout jsonb not null,status text not null default 'draft' check(status in ('draft','submitted','approved','declined')),approved_workout_id uuid references public.workouts(id) on delete set null,updated_at timestamptz not null default now());
alter table public.coach_workout_drafts enable row level security;
revoke all on public.coach_workout_drafts from public,anon,authenticated;
grant select on public.coach_workout_drafts to authenticated;
create policy staff_workout_drafts_read on public.coach_workout_drafts for select to authenticated using(public.staff_is_owner() or (public.staff_can_review() and author_id=auth.uid()));
create function public.save_coach_workout_draft(p_id uuid,p_workout jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 if not public.staff_can_review() then raise exception 'Staff access required.'; end if;
 if jsonb_typeof(p_workout) is distinct from 'object' or length(p_workout::text)>100000 or coalesce(length(trim(p_workout->>'title')),0) not between 1 and 200 then raise exception 'Invalid workout draft.'; end if;
 if p_id is null then insert into public.coach_workout_drafts(author_id,workout) values(auth.uid(),p_workout) returning id into rid;
 else update public.coach_workout_drafts set workout=p_workout,status='draft',updated_at=now() where id=p_id and author_id=auth.uid() and status in ('draft','declined') returning id into rid;
 if rid is null then raise exception 'Only your own unpublished draft can be edited.'; end if;
 end if;
 return rid;
end $$;
create function public.submit_coach_workout_draft(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.staff_can_review() then raise exception 'Staff access required.'; end if;
 update public.coach_workout_drafts set status='submitted',updated_at=now() where id=p_id and author_id=auth.uid() and status='draft';
 if not found then raise exception 'Draft not editable.'; end if;
end $$;
create function public.decide_coach_workout_draft(p_id uuid,p_approve boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.coach_workout_drafts;rid uuid;
begin
 if not public.staff_is_owner() then raise exception 'Owner access required.'; end if;
 select * into d from public.coach_workout_drafts where id=p_id and status='submitted' for update;
 if not found or p_approve is null then raise exception 'Choose a submitted draft and a decision.'; end if;
 if p_approve then
 if exists(select 1 from public.workouts where workout_date=(d.workout->>'workout_date')::date) then raise exception 'That date already has a WOD. This approval cannot overwrite it.'; end if;
 insert into public.workouts(title,description,workout_date,workout_type,time_cap_seconds,notes,prescriptions,created_by,is_hidden) values(d.workout->>'title',d.workout->>'description',(d.workout->>'workout_date')::date,d.workout->>'workout_type',(d.workout->>'time_cap_seconds')::integer,d.workout->>'notes',coalesce(d.workout->'prescriptions','[]'),auth.uid(),true) returning id into rid;
 end if;
 update public.coach_workout_drafts set status=case when p_approve then 'approved' else 'declined' end,approved_workout_id=rid,updated_at=now() where id=p_id;
 insert into public.staff_audit(actor_id,action,target_id,before_data,after_data) values(auth.uid(),'decide_workout_draft',p_id,to_jsonb(d),jsonb_build_object('approved',p_approve,'workout_id',rid));
 return rid;
end $$;
revoke all on function public.save_coach_workout_draft(uuid,jsonb),public.submit_coach_workout_draft(uuid),public.decide_coach_workout_draft(uuid,boolean) from public,anon;
grant execute on function public.save_coach_workout_draft(uuid,jsonb),public.submit_coach_workout_draft(uuid),public.decide_coach_workout_draft(uuid,boolean) to authenticated;

create function public.preserve_completed_day() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if to_jsonb(NEW)-'updated_at' is distinct from to_jsonb(OLD)-'updated_at' and exists(select 1 from public.plan_results where session_id=OLD.id) then raise exception 'This day has saved results. Propose a revised program to preserve the original prescription.'; end if;
 return NEW;
end $$;
create trigger preserve_completed_day before update on public.plan_sessions for each row execute function public.preserve_completed_day();
revoke all on function public.preserve_completed_day() from public,anon,authenticated;

create trigger audit_coach_plan_drafts after insert or update or delete on public.coach_plan_drafts for each row execute function public.audit_program_content();
create trigger audit_coach_workout_drafts after insert or update or delete on public.coach_workout_drafts for each row execute function public.audit_program_content();
create trigger audit_day_suggestions after insert or update or delete on public.plan_day_suggestions for each row execute function public.audit_program_content();

$roles_sql$;
 elsif to_regprocedure('public.staff_is_owner()') is null or to_regclass('public.coach_workout_drafts') is null then
  raise exception 'Staff setup is incomplete. Stop and report this error; no changes were applied.';
 end if;
 if to_regprocedure('public.staff_role_roster(integer)') is null then
  execute $roster_sql$
-- Read-only roster, available only to an MFA-verified Owner.
create function public.staff_role_roster(p_page integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.staff_is_owner() then raise exception 'Owner access and two-factor verification required.'; end if;
 if p_page is null or p_page<0 or p_page>10000 then raise exception 'Invalid page.'; end if;
 return jsonb_build_object(
 'rows',coalesce((select jsonb_agg(to_jsonb(r)) from (
 select s.user_id,p.display_name,l.email,s.role from public.staff_roles s
 join public.profiles p on p.id=s.user_id
 left join public.registration_log l on l.user_id=s.user_id
 where s.role in ('coach','owner') order by s.role,l.email nulls last,s.user_id limit 50 offset p_page*50
 ) r),'[]'::jsonb),
 'coach_count',(select count(*) from public.staff_roles where role='coach'),
 'owner_count',(select count(*) from public.staff_roles where role='owner'),
 'total',(select count(*) from public.staff_roles where role in ('coach','owner')));
end $$;
revoke all on function public.staff_role_roster(integer) from public,anon;
grant execute on function public.staff_role_roster(integer) to authenticated;

$roster_sql$;
 end if;
end
$combined_staff$;
commit;
