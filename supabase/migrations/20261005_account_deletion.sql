-- Preserve shared authored content when an account is permanently removed.
-- Personal records already cascade through profiles/auth.users.
begin;
do $$
declare item record;
begin
  for item in
    select c.conname, c.conrelid::regclass as table_name
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass
      and a.attname = 'created_by' and cardinality(c.conkey) = 1
  loop
    execute format('alter table %s drop constraint %I', item.table_name, item.conname);
    execute format('alter table %s add constraint %I foreign key (created_by) references public.profiles(id) on delete set null', item.table_name, item.conname);
  end loop;
end $$;
commit;
