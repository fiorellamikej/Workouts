-- Apply after the two 20261001 migrations. Preserves existing plans and results.
-- Replaces only the JSON validator so percentage increases and comfortable increases are checked.
begin;
create or replace function public.valid_training_prescriptions(items jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare x jsonb; seen text[] := '{}'; mode text; comfortable numeric;
begin
 if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 40 then return false; end if;
 for x in select value from jsonb_array_elements(items) loop
  if jsonb_typeof(x) <> 'object' or coalesce(x->>'id','') = '' or (x->>'id') = any(seen)
   or coalesce(length(trim(x->>'label')),0) not between 1 and 100
   or coalesce(x->>'record_key','') not in ('squat','deadlift','bench','power_clean','overhead_press','mile','5k','2_mile')
   or coalesce(x->>'unit','') not in ('lb','kg')
   or coalesce(x->>'strategy','') not in ('percent','previous')
   or coalesce((x->>'percent')::numeric,0) not between 1 and 300
   or coalesce((x->>'increment')::numeric,-1) not between 0 and 100
   or coalesce((x->>'rounding')::numeric,0) not between 0.5 and 100
   or coalesce((x->>'sets')::integer,0) not between 1 and 100
   or coalesce((x->>'reps')::integer,0) not between 1 and 1000
  then return false; end if;
  if x->>'record_key' in ('mile','5k','2_mile') and x->>'strategy' <> 'percent' then return false; end if;
  if x->>'record_key' not in ('mile','5k','2_mile') and (x->>'percent')::numeric > 100 then return false; end if;
  mode := coalesce(x->>'progression_mode','fixed');
  comfortable := coalesce((x->>'comfortable_increment')::numeric,case when (x->>'increment')::numeric <= 50 then (x->>'increment')::numeric*2 else (x->>'increment')::numeric end);
  if mode not in ('fixed','percentage') or comfortable not between (x->>'increment')::numeric and 100 then return false; end if;
  if mode = 'percentage' and ((x->>'increment')::numeric > 10 or comfortable > 10) then return false; end if;
  if x->>'strategy' = 'previous' and mode = 'fixed' and
   (mod((x->>'increment')::numeric,(x->>'rounding')::numeric) <> 0 or
    mod(comfortable,(x->>'rounding')::numeric) <> 0) then return false; end if;
  seen := array_append(seen,x->>'id');
 end loop;
 return true;
exception when others then return false;
end $$;

commit;
notify pgrst, 'reload schema';
