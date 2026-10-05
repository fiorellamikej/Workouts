begin;

-- Page paths only. No typed input, query strings, IP addresses, or replay data.
create table if not exists public.beta_usage_sessions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 started_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now()
);
create index if not exists beta_usage_sessions_user_time on public.beta_usage_sessions(user_id,last_seen_at desc);
create table if not exists public.beta_usage_events (
 id uuid primary key,
 session_id uuid not null references public.beta_usage_sessions(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 page_path text not null,
 is_page_view boolean not null,
 activity_date date not null,
 created_at timestamptz not null default now()
);
create index if not exists beta_usage_events_user_time on public.beta_usage_events(user_id,created_at desc);
alter table public.beta_usage_sessions enable row level security;
alter table public.beta_usage_events enable row level security;
revoke all on public.beta_usage_sessions,public.beta_usage_events from public,anon,authenticated;
grant select on public.beta_usage_sessions,public.beta_usage_events to authenticated;
drop policy if exists beta_sessions_admin_read on public.beta_usage_sessions;
create policy beta_sessions_admin_read on public.beta_usage_sessions for select to authenticated using(public.support_is_admin());
drop policy if exists beta_events_admin_read on public.beta_usage_events;
create policy beta_events_admin_read on public.beta_usage_events for select to authenticated using(public.support_is_admin());

create or replace function public.record_beta_activity(p_page_path text,p_page_view boolean,p_event_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); t timestamptz:=now(); sess public.beta_usage_sessions; tz text;
begin
 if u is null then return;end if;
 if p_event_id is null or p_page_view is null or p_page_path is null then raise exception 'Invalid activity.';end if;
 if not (p_page_path in ('/','/dashboard','/plans','/profile','/heroes','/feedback','/badges','/workouts','/leaderboard','/exercises','/help','/faq')
  or p_page_path ~ '^/plans/[0-9a-fA-F-]{36}(/overview)?$'
  or p_page_path ~ '^/workouts/[0-9a-fA-F-]{36}$'
  or p_page_path ~ '^/heroes/[a-z0-9-]{1,100}$'
  or p_page_path ~ '^/admin(/[a-z-]{1,50})?$') then raise exception 'Invalid activity page.';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,105));
 -- Repeated requests with the same ID cannot create duplicate activity.
 if exists(select 1 from public.beta_usage_events where id=p_event_id) then return;end if;
 if (select count(*) from public.beta_usage_events where user_id=u and created_at>t-interval '1 hour')>=240 then return;end if;
 select * into sess from public.beta_usage_sessions where user_id=u order by last_seen_at desc,id limit 1;
 if sess.id is null or sess.last_seen_at<t-interval '30 minutes' then
  insert into public.beta_usage_sessions(user_id,started_at,last_seen_at) values(u,t,t) returning * into sess;
 elsif not p_page_view and sess.last_seen_at>t-interval '60 seconds' then return;
 else update public.beta_usage_sessions set last_seen_at=t where id=sess.id;
 end if;
 select timezone into tz from public.badge_settings where user_id=u;
 tz:=coalesce(tz,'America/New_York');
 insert into public.beta_usage_events(id,session_id,user_id,page_path,is_page_view,activity_date,created_at)
 values(p_event_id,sess.id,u,p_page_path,p_page_view,(t at time zone tz)::date,t);
end $$;

create or replace function public.admin_beta_activity(p_days integer default 30,p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare since timestamptz; rows jsonb; total bigint;
begin
 if not public.support_is_admin() then raise exception 'Admin access required.';end if;
 if p_days is null or p_days not in (7,30,90) then raise exception 'Invalid range.';end if;
 since:=now()-make_interval(days=>p_days);
 select count(*) into total from auth.users;
 select coalesce(jsonb_agg(x.row order by x.last_active desc nulls last,x.registered_at desc,x.user_id),'[]'::jsonb) into rows
 from (
  select u.id user_id,u.created_at registered_at,usage.last_active,
   jsonb_build_object(
    'user_id',u.id,'display_name',coalesce(nullif(p.display_name,''),'Athlete'),
    'registered_at',u.created_at,'last_sign_in_at',u.last_sign_in_at,'last_active',usage.last_active,
    'visits',coalesce(usage.visits,0),'active_days',coalesce(events.active_days,0),'page_views',coalesce(events.page_views,0),
    'completed_workouts',
     (select count(*) from public.results r join public.workouts w on w.id=r.workout_id where r.user_id=u.id and r.created_at>=since and w.workout_type<>'rest')+
     (select count(*) from public.plan_results r join public.plan_sessions s on s.id=r.session_id where r.user_id=u.id and r.completed_at>=since and s.session_type<>'rest'),
    'hero_attempts',(select count(*) from public.hero_results where user_id=u.id and created_at>=since),
    'prs_logged',(select count(*) from public.athlete_records where user_id=u.id and created_at>=since),
    'feedback_count',(select count(*) from public.feedback_reports where user_id=u.id and created_at>=since),
    'error_count',(select count(*) from public.app_error_events where user_id=u.id and created_at>=since),
    'plans',coalesce((select jsonb_agg(t.title order by t.title) from public.user_plan_enrollments e join public.training_plans t on t.id=e.plan_id where e.user_id=u.id and e.is_following),'[]'::jsonb)
   ) row
  from auth.users u left join public.profiles p on p.id=u.id
  left join lateral (select max(last_seen_at) last_active,count(*) filter(where started_at>=since) visits from public.beta_usage_sessions where user_id=u.id) usage on true
  left join lateral (select count(distinct activity_date) active_days,count(*) filter(where is_page_view) page_views from public.beta_usage_events where user_id=u.id and created_at>=since) events on true
  order by usage.last_active desc nulls last,u.created_at desc,u.id
  limit least(greatest(coalesce(p_limit,50),1),100) offset least(greatest(coalesce(p_offset,0),0),100000)
 ) x;
 return jsonb_build_object('athletes',rows,'total',total,'days',p_days);
end $$;

create or replace function public.admin_beta_activity_detail(p_user uuid,p_days integer default 30) returns jsonb
language plpgsql security definer set search_path='' as $$
declare since timestamptz; events jsonb; pages jsonb;
begin
 if not public.support_is_admin() then raise exception 'Admin access required.';end if;
 if p_days is null or p_days not in (7,30,90) then raise exception 'Invalid range.';end if;
 since:=now()-make_interval(days=>p_days);
 select coalesce(jsonb_agg(x order by x.occurred_at desc,x.label),'[]'::jsonb) into events from (
  select * from (
   select 'page_view' category,e.page_path label,e.page_path,e.created_at occurred_at from public.beta_usage_events e where e.user_id=p_user and e.is_page_view and e.created_at>=since
   union all
   select 'daily_wod',w.title,'/workouts/'||w.id,r.created_at from public.results r join public.workouts w on w.id=r.workout_id where r.user_id=p_user and r.created_at>=since and w.workout_type<>'rest'
   union all
   select 'program_workout',t.title||' / '||s.title,'/plans/'||t.id,r.completed_at from public.plan_results r join public.plan_sessions s on s.id=r.session_id join public.training_plans t on t.id=s.plan_id where r.user_id=p_user and r.completed_at>=since and s.session_type<>'rest'
   union all
   select 'hero_attempt',r.workout_slug,'/heroes/'||r.workout_slug,r.created_at from public.hero_results r where r.user_id=p_user and r.created_at>=since
   union all
   select 'pr_logged',r.record_key,'/profile',r.created_at from public.athlete_records r where r.user_id=p_user and r.created_at>=since
   union all
   select 'feedback',r.kind||': '||r.title,'/admin/feedback',r.created_at from public.feedback_reports r where r.user_id=p_user and r.created_at>=since
   union all
   select 'error',r.error_code,r.page_path,r.created_at from public.app_error_events r where r.user_id=p_user and r.created_at>=since
  ) timeline order by occurred_at desc,label limit 100
 ) x;
 select coalesce(jsonb_agg(x order by x.views desc,x.page_path),'[]'::jsonb) into pages from (
  select page_path,count(*) views from public.beta_usage_events where user_id=p_user and is_page_view and created_at>=since group by page_path order by views desc,page_path limit 20
 ) x;
 return jsonb_build_object('events',events,'pages',pages);
end $$;

-- Read state belongs to each administrator; triage status is separate.
create table if not exists public.admin_feedback_reads (
 admin_id uuid not null references public.profiles(id) on delete cascade,
 report_id uuid not null references public.feedback_reports(id) on delete cascade,
 read_at timestamptz not null default now(),primary key(admin_id,report_id)
);
alter table public.admin_feedback_reads enable row level security;
revoke all on public.admin_feedback_reads from public,anon,authenticated;
grant select on public.admin_feedback_reads to authenticated;
drop policy if exists admin_feedback_reads_own on public.admin_feedback_reads;
create policy admin_feedback_reads_own on public.admin_feedback_reads for select to authenticated using(admin_id=auth.uid() and public.support_is_admin());
create or replace function public.admin_feedback_notifications() returns jsonb
language plpgsql security definer set search_path='' as $$
declare bugs bigint; suggestions bigint; reports jsonb;
begin
 if not public.support_is_admin() then raise exception 'Admin access required.';end if;
 select count(*) filter(where f.kind='bug'),count(*) filter(where f.kind='suggestion') into bugs,suggestions
 from public.feedback_reports f where not exists(select 1 from public.admin_feedback_reads r where r.admin_id=auth.uid() and r.report_id=f.id);
 select coalesce(jsonb_agg(x order by x.created_at desc,x.id),'[]'::jsonb) into reports from (
  select f.id,f.kind,f.title,f.created_at from public.feedback_reports f where not exists(select 1 from public.admin_feedback_reads r where r.admin_id=auth.uid() and r.report_id=f.id) order by f.created_at desc,f.id limit 20
 ) x;
 return jsonb_build_object('bugs',bugs,'suggestions',suggestions,'total',bugs+suggestions,'reports',reports);
end $$;
create or replace function public.mark_feedback_notifications_read(p_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.support_is_admin() then raise exception 'Admin access required.';end if;
 if p_ids is null or cardinality(p_ids)>100 then raise exception 'Invalid report selection.';end if;
 insert into public.admin_feedback_reads(admin_id,report_id)
 select auth.uid(),id from public.feedback_reports where id=any(p_ids) on conflict(admin_id,report_id) do nothing;
end $$;
revoke all on function public.record_beta_activity(text,boolean,uuid),public.admin_beta_activity(integer,integer,integer),public.admin_beta_activity_detail(uuid,integer),public.admin_feedback_notifications(),public.mark_feedback_notifications_read(uuid[]) from public,anon;
grant execute on function public.record_beta_activity(text,boolean,uuid),public.admin_beta_activity(integer,integer,integer),public.admin_beta_activity_detail(uuid,integer),public.admin_feedback_notifications(),public.mark_feedback_notifications_read(uuid[]) to authenticated;
commit;
