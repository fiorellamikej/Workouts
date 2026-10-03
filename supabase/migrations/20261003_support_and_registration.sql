begin;
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,email,display_name) values(new.id,new.email,
 left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),split_part(new.email,'@',1),'Athlete'),100));
 return new;
end $$;
revoke all on function public.handle_new_user() from public,anon,authenticated;

-- Keep leaderboard display names available, but never expose account emails through profiles.
revoke select on public.profiles from anon, authenticated;
revoke select(email) on public.profiles from anon, authenticated;
grant select(id,display_name,avatar_url,is_admin,created_at,updated_at) on public.profiles to anon, authenticated;

create or replace function public.support_is_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and is_admin=true)
$$;
revoke all on function public.support_is_admin() from public;
grant execute on function public.support_is_admin() to authenticated;

create table if not exists public.feedback_reports(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('bug','suggestion')),title text not null check(length(title) between 1 and 120),
 description text not null check(length(description) between 1 and 4000),page_path text not null default '/',
 status text not null default 'open' check(status in ('open','in_review','resolved','dismissed')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists feedback_reports_created on public.feedback_reports(created_at desc);
alter table public.feedback_reports enable row level security;
create policy support_feedback_read on public.feedback_reports for select to authenticated using(user_id=auth.uid() or public.support_is_admin());
revoke all on public.feedback_reports from anon,authenticated;
grant select on public.feedback_reports to authenticated;

create table if not exists public.app_error_events(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,
 source text not null check(source in ('window','promise','boundary','operation')),page_path text not null,
 error_code text not null,digest text,created_at timestamptz not null default now(),resolved_at timestamptz
);
create index if not exists app_error_events_created on public.app_error_events(created_at desc);
alter table public.app_error_events enable row level security;
create policy support_errors_read on public.app_error_events for select to authenticated using(public.support_is_admin());
revoke all on public.app_error_events from anon,authenticated;
grant select on public.app_error_events to authenticated;

create table if not exists public.registration_log(
 user_id uuid primary key references auth.users(id) on delete cascade,email text,
 registered_at timestamptz not null,email_confirmed_at timestamptz,
 mailing_opt_in boolean not null default false,consent_updated_at timestamptz
);
alter table public.registration_log enable row level security;
create policy support_registrations_read on public.registration_log for select to authenticated using(public.support_is_admin());
revoke all on public.registration_log from anon,authenticated;
grant select on public.registration_log to authenticated;
-- Older accounts are intentionally not automatically opted in.
insert into public.registration_log(user_id,email,registered_at,email_confirmed_at)
select id,email,created_at,email_confirmed_at from auth.users on conflict(user_id) do nothing;

create or replace function public.sync_registration_log() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then
  insert into public.registration_log(user_id,email,registered_at,email_confirmed_at,mailing_opt_in,consent_updated_at)
  values(new.id,new.email,new.created_at,new.email_confirmed_at,
    coalesce(new.raw_user_meta_data->>'mailing_opt_in','false')='true',
    case when new.raw_user_meta_data->>'mailing_opt_in'='true' then now() end)
  on conflict(user_id) do nothing;
 else
  update public.registration_log set email=new.email,email_confirmed_at=new.email_confirmed_at where user_id=new.id;
  update public.profiles set email=new.email where id=new.id;
 end if;
 return new;
end $$;
revoke all on function public.sync_registration_log() from public,anon,authenticated;
drop trigger if exists support_registration_sync on auth.users;
create trigger support_registration_sync after insert or update of email,email_confirmed_at on auth.users for each row execute function public.sync_registration_log();

create or replace function public.submit_feedback(p_kind text,p_title text,p_description text,p_page_path text default '/') returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rid uuid;
begin
 if uid is null then raise exception 'Sign in first.';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,83));
 if (select count(*) from public.feedback_reports where user_id=uid and created_at>now()-interval '1 hour')>=10 then raise exception 'Please wait before submitting more reports.';end if;
 if p_kind is null or p_kind not in ('bug','suggestion') or p_title is null or length(trim(p_title)) not between 1 and 120 or p_description is null or length(trim(p_description)) not between 1 and 4000 then raise exception 'Enter a title and description within the allowed lengths.';end if;
 insert into public.feedback_reports(user_id,kind,title,description,page_path) values(uid,p_kind,trim(p_title),trim(p_description),left(split_part(split_part(coalesce(p_page_path,'/'),'?',1),'#',1),200)) returning id into rid;
 return rid;
end $$;
create or replace function public.triage_feedback(p_id uuid,p_status text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.support_is_admin() then raise exception 'Admin access required.';end if;
 if p_status is null or p_status not in ('open','in_review','resolved','dismissed') then raise exception 'Invalid status.';end if;
 update public.feedback_reports set status=p_status,updated_at=now() where id=p_id;
 if not found then raise exception 'Report not found.';end if;
end $$;
create or replace function public.record_app_error(p_source text,p_page_path text,p_error_code text,p_digest text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();rid uuid;
begin
 if uid is null then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,84));
 if (select count(*) from public.app_error_events where user_id=uid and created_at>now()-interval '1 hour')>=20 then return null;end if;
 if p_source is null or p_source not in ('window','promise','boundary','operation') then raise exception 'Invalid error source.';end if;
 insert into public.app_error_events(user_id,source,page_path,error_code,digest)
 values(uid,p_source,left(split_part(split_part(coalesce(p_page_path,'/'),'?',1),'#',1),200),
 case when p_error_code ~ '^[A-Za-z0-9_]{1,40}$' then p_error_code else 'UnexpectedError' end,
 case when p_digest ~ '^[A-Za-z0-9_-]{1,80}$' then p_digest end) returning id into rid;
 return rid;
end $$;
create or replace function public.resolve_app_error(p_id uuid,p_resolved boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.support_is_admin() then raise exception 'Admin access required.';end if;
 update public.app_error_events set resolved_at=case when p_resolved then now() end where id=p_id;
 if not found then raise exception 'Error not found.';end if;
end $$;
create or replace function public.my_mailing_preference() returns boolean
language sql stable security definer set search_path='' as $$ select coalesce((select mailing_opt_in from public.registration_log where user_id=auth.uid()),false) $$;
create or replace function public.set_mailing_preference(p_opt_in boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.';end if;
 update public.registration_log set mailing_opt_in=coalesce(p_opt_in,false),consent_updated_at=now() where user_id=auth.uid();
 if not found then raise exception 'Account registration missing.';end if;
end $$;
revoke all on function public.submit_feedback(text,text,text,text),public.triage_feedback(uuid,text),public.record_app_error(text,text,text,text),public.resolve_app_error(uuid,boolean),public.my_mailing_preference(),public.set_mailing_preference(boolean) from public,anon;
grant execute on function public.submit_feedback(text,text,text,text),public.triage_feedback(uuid,text),public.record_app_error(text,text,text,text),public.resolve_app_error(uuid,boolean),public.my_mailing_preference(),public.set_mailing_preference(boolean) to authenticated;
commit;
