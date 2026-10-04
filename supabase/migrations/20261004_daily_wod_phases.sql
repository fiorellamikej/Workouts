begin;
create or replace function public.daily_wod_today() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'America/New_York')::date $$;
create or replace function public.daily_wod_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and is_admin=true)
$$;
revoke all on function public.daily_wod_today(), public.daily_wod_is_admin() from public;
grant execute on function public.daily_wod_today(), public.daily_wod_is_admin() to anon, authenticated;

create table public.daily_wod_phases (
 id uuid primary key default gen_random_uuid(),
 phase_key text not null check(phase_key in ('base','strength_skill','pre_competition','deload')),
 start_date date not null check(start_date between date '2000-01-01' and date '2100-12-31'),
 end_date date not null check(end_date between date '2000-01-01' and date '2100-12-31'),
 created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
 check(case when phase_key='deload' then end_date-start_date+1 between 7 and 14 else end_date-start_date+1=56 end),
 exclude using gist (daterange(start_date,end_date,'[]') with &&)
);
alter table public.daily_wod_phases enable row level security;
revoke all on public.daily_wod_phases from anon, authenticated;
grant select on public.daily_wod_phases to anon, authenticated;
create policy daily_phases_read on public.daily_wod_phases for select using(true);
-- Writes are intentionally available only through the validated admin import.
alter table public.workouts add column phase_id uuid references public.daily_wod_phases(id) on delete restrict;
create index workouts_phase_id on public.workouts(phase_id);
alter table public.workouts add constraint daily_workout_supported_type check(workout_type in ('for_time','amrap','emom','strength','skill','intervals','endurance','rest','other')) not valid;
-- Older custom type strings remain readable; all new/changed rows use supported types.
drop policy if exists "Workouts are viewable by everyone" on public.workouts;
create policy "Workouts are viewable by everyone" on public.workouts for select
using (workout_date <= public.daily_wod_today() or public.daily_wod_is_admin());

create or replace function public.import_daily_wod_phase(p_phase jsonb,p_workouts jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); kind text; first_day date; last_day date; total integer;
 phase_uuid uuid; item jsonb; target jsonb; d date; existing public.workouts;
 added integer:=0; unchanged integer:=0; target_ids text[];
begin
 if uid is null or not public.daily_wod_is_admin() then raise exception 'Admin access required.'; end if;
 if jsonb_typeof(p_phase) is distinct from 'object' or jsonb_typeof(p_workouts) is distinct from 'array' then raise exception 'Invalid phase import.'; end if;
 kind:=p_phase->>'key';
 if kind is null or kind not in ('base','strength_skill','pre_competition','deload') then raise exception 'Invalid phase key.'; end if;
 if coalesce(p_phase->>'start_date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_phase->>'end_date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid phase dates.'; end if;
 first_day:=(p_phase->>'start_date')::date; last_day:=(p_phase->>'end_date')::date; total:=jsonb_array_length(p_workouts);
 if first_day<date '2000-01-01' or last_day>date '2100-12-31' or last_day-first_day+1<>total or
   (kind='deload' and total not between 7 and 14) or (kind<>'deload' and total<>56) then raise exception 'Import the complete consecutive phase, including rest days.'; end if;
 perform pg_advisory_xact_lock(610042);
 if (select count(distinct value->>'workout_date') from jsonb_array_elements(p_workouts))<>total then raise exception 'Duplicate workout dates.'; end if;
 for item in select value from jsonb_array_elements(p_workouts) loop
   if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'workout_date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid workout date.'; end if;
   d:=(item->>'workout_date')::date;
   if d not between first_day and last_day then raise exception 'Workout date is outside the phase.'; end if;
   if jsonb_typeof(item->'title') is distinct from 'string' or length(trim(item->>'title')) not between 1 and 200
      or jsonb_typeof(item->'description') is distinct from 'string' or length(trim(item->>'description')) not between 1 and 30000 then raise exception 'Enter a title and full workout instructions.'; end if;
   if item->>'workout_type' is null or item->>'workout_type' not in ('for_time','amrap','emom','strength','skill','intervals','endurance','rest','other') then raise exception 'Unsupported workout type.'; end if;
   if item->'notes' is not null and item->'notes'<>'null'::jsonb and (jsonb_typeof(item->'notes')<>'string' or length(item->>'notes')>10000) then raise exception 'Invalid notes.'; end if;
   if item->'time_cap_seconds' is not null and item->'time_cap_seconds'<>'null'::jsonb and
     (jsonb_typeof(item->'time_cap_seconds')<>'number' or (item->>'time_cap_seconds') !~ '^[0-9]+$' or (item->>'time_cap_seconds')::numeric not between 1 and 86400) then raise exception 'Invalid time cap.'; end if;
   if jsonb_typeof(item->'prescriptions') is distinct from 'array' or not public.valid_training_prescriptions(item->'prescriptions') then raise exception 'Invalid personalized targets.'; end if;
   if item->>'workout_type'='rest' and jsonb_array_length(item->'prescriptions')>0 then raise exception 'Rest days cannot have prescribed training targets.'; end if;
   target_ids:='{}';
   for target in select value from jsonb_array_elements(item->'prescriptions') loop
     if jsonb_typeof(target->'id') is distinct from 'string' or length(trim(target->>'id')) not between 1 and 100
       or jsonb_typeof(target->'label') is distinct from 'string' or length(trim(target->>'label')) not between 1 and 100
       or target->>'id'=any(target_ids) or target->>'strategy' is distinct from 'percent'
       or target->>'unit' is null or target->>'unit' not in ('lb','kg') then raise exception 'Daily targets need unique IDs, labels, percent strategy and lb/kg units.'; end if;
     target_ids:=array_append(target_ids,target->>'id');
     if jsonb_typeof(target->'sets') is distinct from 'number' or (target->>'sets') !~ '^[0-9]+$' or (target->>'sets')::numeric not between 1 and 100
        or jsonb_typeof(target->'reps') is distinct from 'number' or (target->>'reps') !~ '^[0-9]+$' or (target->>'reps')::numeric not between 1 and 1000
        or jsonb_typeof(target->'percent') is distinct from 'number' or (target->>'percent')::numeric not between 1 and 300
        or (target->>'record_key' in ('squat','bench','deadlift','power_clean','overhead_press') and (target->>'percent')::numeric>100)
        or jsonb_typeof(target->'rounding') is distinct from 'number' or (target->>'rounding')::numeric not between 0.5 and 100
        or jsonb_typeof(target->'increment') is distinct from 'number' or (target->>'increment')::numeric not between 0 and 100 then raise exception 'Invalid target amounts.'; end if;
   end loop;
 end loop;
 select id into phase_uuid from public.daily_wod_phases where phase_key=kind and start_date=first_day and end_date=last_day;
 if phase_uuid is null then
   insert into public.daily_wod_phases(phase_key,start_date,end_date,created_by) values(kind,first_day,last_day,uid) returning id into phase_uuid;
 end if;
 for item in select value from jsonb_array_elements(p_workouts) order by value->>'workout_date' loop
   item:=public.plain_display_text(item);
   select * into existing from public.workouts where workout_date=(item->>'workout_date')::date for update;
   if found then
     if existing.phase_id is not distinct from phase_uuid and existing.title=trim(item->>'title')
       and existing.description=trim(item->>'description') and existing.workout_type=item->>'workout_type'
       and existing.time_cap_seconds is not distinct from (item->>'time_cap_seconds')::integer
       and existing.notes is not distinct from nullif(trim(item->>'notes'),'') and existing.prescriptions=item->'prescriptions' then
       unchanged:=unchanged+1;
     else raise exception 'A different WOD already exists on %. Nothing was imported. Review it in Admin before retrying.', item->>'workout_date'; end if;
   else
     insert into public.workouts(workout_date,title,description,workout_type,time_cap_seconds,notes,prescriptions,phase_id,created_by)
     values((item->>'workout_date')::date,trim(item->>'title'),trim(item->>'description'),item->>'workout_type',(item->>'time_cap_seconds')::integer,nullif(trim(item->>'notes'),''),item->'prescriptions',phase_uuid,uid);
     added:=added+1;
   end if;
 end loop;
 return jsonb_build_object('phase_id',phase_uuid,'inserted',added,'unchanged',unchanged,'start_date',first_day,'end_date',last_day);
end $$;
revoke all on function public.import_daily_wod_phase(jsonb,jsonb) from public,anon;
grant execute on function public.import_daily_wod_phase(jsonb,jsonb) to authenticated;

create or replace function public.check_daily_wod_phase_row() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.phase_id is not null and not exists(select 1 from public.daily_wod_phases where id=new.phase_id and new.workout_date between start_date and end_date) then
   raise exception 'Workout date must fall within its assigned phase.';
 end if;
 if new.workout_type='rest' and jsonb_array_length(new.prescriptions)>0 then raise exception 'Rest days cannot have training targets.'; end if;
 if TG_OP='UPDATE' and new.workout_type='rest' and exists(select 1 from public.results where workout_id=new.id) then
   raise exception 'This WOD has logged results. Do not change it to a rest day.';
 end if;
 return new;
end $$;
revoke all on function public.check_daily_wod_phase_row() from public,anon,authenticated;
create trigger check_daily_wod_phase before insert or update on public.workouts for each row execute function public.check_daily_wod_phase_row();

create or replace function public.check_daily_wod_result_date() returns trigger
language plpgsql security definer set search_path='' as $$
declare wod public.workouts;
begin
 select * into wod from public.workouts where id=new.workout_id;
 if not found then raise exception 'Workout not found.'; end if;
 if wod.workout_type='rest' then raise exception 'Rest days do not require or award workout results.'; end if;
 if wod.workout_date>public.daily_wod_today() and not public.daily_wod_is_admin() then raise exception 'This WOD is not available yet.'; end if;
 return new;
end $$;
revoke all on function public.check_daily_wod_result_date() from public,anon,authenticated;
create trigger daily_wod_result_date before insert or update on public.results for each row execute function public.check_daily_wod_result_date();
commit;
