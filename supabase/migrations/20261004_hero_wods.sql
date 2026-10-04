begin;
-- Stable identities/scoring for the source-verified catalog shipped with the app.
create table public.hero_workouts (
 slug text primary key,
 score_type text not null check(score_type in ('for_time','amrap')),
 round_reps integer check(round_reps > 0)
);
alter table public.hero_workouts enable row level security;
create policy hero_catalog_read on public.hero_workouts for select using(true);
revoke all on public.hero_workouts from public,anon,authenticated;
grant select on public.hero_workouts to anon,authenticated;
insert into public.hero_workouts(slug,score_type,round_reps) values
('white','for_time',null),
('nutts','for_time',null),
('murph','for_time',null),
('dt','for_time',null),
('jt','for_time',null),
('kalsu','for_time',null),
('randy','for_time',null),
('michael','for_time',null),
('nate','amrap',14),
('chad','for_time',null),
('mr-joshua','for_time',null),
('mcghee','amrap',27),
('the-seven','for_time',null),
('ryan','for_time',null),
('jason','for_time',null),
('badger','for_time',null),
('manion','for_time',null),
('donny','for_time',null);
create table public.hero_results (
 id uuid primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 workout_slug text not null references public.hero_workouts(slug),
 performed_on date not null,
 is_rx boolean not null default false,
 completion_time_seconds integer check(completion_time_seconds between 1 and 999999),
 rounds integer check(rounds between 0 and 10000),
 extra_reps integer check(extra_reps between 0 and 10000),
 notes text not null default '' check(length(notes)<=2000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((completion_time_seconds is not null and rounds is null and extra_reps is null)
 or (completion_time_seconds is null and rounds is not null and extra_reps is not null)),
 check(is_rx or length(trim(notes))>0)
);
create index hero_results_history on public.hero_results(user_id,workout_slug,performed_on desc,created_at desc);
alter table public.hero_results enable row level security;
create policy hero_results_private_read on public.hero_results for select to authenticated using(user_id=auth.uid());
revoke all on public.hero_results from public,anon,authenticated;
grant select on public.hero_results to authenticated;
-- Only this RPC writes results: identity, ownership, score format, date and Rx reps are checked server-side.
create function public.save_hero_result(p_id uuid,p_workout text,p_result jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); kind text; round_size integer; d date; rx boolean; t integer; r integer; e integer; n text; owner uuid; existing_workout text; tz text;
begin
 if u is null then raise exception 'Please log in'; end if;
 if p_id is null or jsonb_typeof(p_result) is distinct from 'object' then raise exception 'Invalid attempt'; end if;
 select score_type,round_reps into kind,round_size from public.hero_workouts where slug=p_workout;
 if kind is null then raise exception 'Unknown Hero workout'; end if;
 -- Same attempt ID serializes retries and corrections, including simultaneous requests.
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select user_id,workout_slug into owner,existing_workout from public.hero_results where id=p_id;
 if owner is not null and (owner<>u or existing_workout<>p_workout) then raise exception 'This attempt cannot be edited'; end if;
 if jsonb_typeof(p_result->'performed_on') is distinct from 'string' or (p_result->>'performed_on') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose a valid workout date'; end if;
 d:=(p_result->>'performed_on')::date;
 select timezone into tz from public.badge_settings where user_id=u;
 if d>(now() at time zone coalesce(tz,'America/New_York'))::date then raise exception 'Choose today or an earlier workout date'; end if;
 if jsonb_typeof(p_result->'is_rx') is distinct from 'boolean' then raise exception 'Choose Rx or scaled'; end if;
 rx:=(p_result->>'is_rx')::boolean;
 if jsonb_typeof(p_result->'notes') is distinct from 'string' then raise exception 'Notes must be text'; end if;
 n:=regexp_replace(p_result->>'notes','^\s+|\s+$','','g');
 if length(n)>2000 or (not rx and length(n)=0) then raise exception 'Describe scaling in notes (up to 2,000 characters)'; end if;
 if kind='for_time' then
  if jsonb_typeof(p_result->'completion_time_seconds') is distinct from 'number' or (p_result->>'completion_time_seconds') !~ '^[0-9]+$' then raise exception 'Enter a whole, positive finish time'; end if;
  t:=(p_result->>'completion_time_seconds')::integer;
  if t not between 1 and 999999 or coalesce(p_result->>'rounds',p_result->>'extra_reps') is not null then raise exception 'Invalid for-time score'; end if;
 else
  if jsonb_typeof(p_result->'rounds') is distinct from 'number' or jsonb_typeof(p_result->'extra_reps') is distinct from 'number' or (p_result->>'rounds') !~ '^[0-9]+$' or (p_result->>'extra_reps') !~ '^[0-9]+$' then raise exception 'Enter whole, nonnegative rounds and extra reps'; end if;
  r:=(p_result->>'rounds')::integer; e:=(p_result->>'extra_reps')::integer;
  if r not between 0 and 10000 or e not between 0 and 10000 or p_result->>'completion_time_seconds' is not null then raise exception 'Invalid AMRAP score'; end if;
  if rx and e>=round_size then raise exception 'Count full rounds before extra reps'; end if;
 end if;
 insert into public.hero_results(id,user_id,workout_slug,performed_on,is_rx,completion_time_seconds,rounds,extra_reps,notes)
 values(p_id,u,p_workout,d,rx,t,r,e,n)
 on conflict(id) do update set performed_on=excluded.performed_on,is_rx=excluded.is_rx,completion_time_seconds=excluded.completion_time_seconds,rounds=excluded.rounds,extra_reps=excluded.extra_reps,notes=excluded.notes,updated_at=now();
 return p_id;
end $$;
revoke all on function public.save_hero_result(uuid,text,jsonb) from public,anon;
grant execute on function public.save_hero_result(uuid,text,jsonb) to authenticated;

-- Hero completions contribute to the existing completion total; attendance/rest-day streak rules stay intact.
create or replace function public.my_badge_summary() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); tz text; today date; streak integer; total integer; days integer;
begin
 if u is null then raise exception 'Please log in'; end if;
 perform public.refresh_athlete_badges(u);
 select timezone into tz from public.badge_settings where user_id=u; today:=(now() at time zone coalesce(tz,'America/New_York'))::date;
 -- Today has until midnight to be attended. Rest days protect a chain, never manufacture a new chain.
 with c as (select * from public.streak_calendar(u,today)), last_miss as (select max(day) d from c where not checked_in and not rest_day and day<today), first_check as (select min(day) d from c where checked_in and day>coalesce((select d from last_miss),'-infinity'::date))
 select count(*) filter(where checked_in)::integer, count(*)::integer into streak,days from c where day>coalesce((select d from last_miss),'-infinity'::date) and day>=(select d from first_check);
 select (select count(*) from public.plan_results r join public.plan_sessions s on s.id=r.session_id where r.user_id=u and s.session_type<>'rest')+(select count(*) from public.results where user_id=u)+(select count(*) from public.hero_results where user_id=u) into total;
 return jsonb_build_object('checkin_streak',coalesce(streak,0),'calendar_span',coalesce(days,0),'completed_workouts',total,'timezone',coalesce(tz,'America/New_York'),'badges',coalesce((select jsonb_agg(to_jsonb(b)) from public.athlete_badges b where user_id=u),'[]'::jsonb));
end $$;

commit;
notify pgrst,'reload schema';
