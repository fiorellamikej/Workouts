begin;
create table if not exists public.user_onboarding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dismissed_at timestamptz not null default now()
);
alter table public.user_onboarding enable row level security;
revoke all on public.user_onboarding from anon, authenticated;
grant select, insert, update on public.user_onboarding to authenticated;
create policy onboarding_read on public.user_onboarding for select to authenticated using (user_id = auth.uid());
create policy onboarding_insert on public.user_onboarding for insert to authenticated with check (user_id = auth.uid());
create policy onboarding_update on public.user_onboarding for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.delete_daily_wod(p_workout_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.support_is_admin() then
    raise exception 'Admin access required.';
  end if;
  delete from public.workouts where id = p_workout_id;
  if not found then raise exception 'WOD not found. Reload before retrying.'; end if;
end $$;
revoke all on function public.delete_daily_wod(uuid) from public, anon;
grant execute on function public.delete_daily_wod(uuid) to authenticated;
commit;
