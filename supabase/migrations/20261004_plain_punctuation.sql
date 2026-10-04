-- Normalize displayed text already in the database and future content writes.
-- JSON keys, email addresses, links, IDs, scores, and timestamps are unchanged.
begin;
create or replace function public.plain_display_text(value jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare output jsonb; item jsonb; pair record;
begin
  case jsonb_typeof(value)
    when 'string' then return to_jsonb(replace(value #>> '{}', chr(8212), '-'));
    when 'array' then
      output := '[]'::jsonb;
      for item in select jsonb_array_elements(value) loop
        output := output || jsonb_build_array(public.plain_display_text(item));
      end loop;
      return output;
    when 'object' then
      output := '{}'::jsonb;
      for pair in select * from jsonb_each(value) loop
        output := output || jsonb_build_object(pair.key,
          case when pair.key in ('id','prescription_id','record_key','url','video_url','source_url')
            then pair.value else public.plain_display_text(pair.value) end);
      end loop;
      return output;
    else return value;
  end case;
end $$;
create or replace function public.normalize_display_fields() returns trigger
language plpgsql set search_path = '' as $$
declare row_data jsonb := to_jsonb(new); field text;
begin
  foreach field in array TG_ARGV loop
    if row_data ? field then
      row_data := jsonb_set(row_data, array[field], public.plain_display_text(row_data -> field));
    end if;
  end loop;
  new := jsonb_populate_record(new, row_data);
  return new;
end $$;
-- Only presentation fields in application tables are eligible.
do $$
declare tab record; col record; arguments text; assignments text; conditions text;
begin
  for tab in select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
      and table_name in ('workouts','exercises','workout_exercises','training_plans','plan_sessions',
        'hero_workouts','hero_results','profiles','results','plan_results','athlete_records',
        'feedback_reports','prs','training_exercise_logs','wod_exercise_logs')
  loop
    arguments := ''; assignments := ''; conditions := '';
    for col in select column_name, udt_name from information_schema.columns
      where table_schema = 'public' and table_name = tab.table_name
        and column_name in ('title','name','display_name','description','notes','goal','tags',
          'equipment_required','equipment_suggested','fitness_guidance','prescriptions',
          'exercise_entries','label','instructions','scaling','story','equipment','movements','weight_used','muscle_groups')
        and udt_name in ('text','varchar','jsonb','_text')
    loop
      arguments := arguments || case when arguments = '' then '' else ',' end || quote_literal(col.column_name);
      assignments := assignments || case when assignments = '' then '' else ',' end ||
        case col.udt_name
          when 'jsonb' then format('%I = public.plain_display_text(%I)', col.column_name, col.column_name)
          when '_text' then format('%I = array(select jsonb_array_elements_text(public.plain_display_text(to_jsonb(%I))))', col.column_name, col.column_name)
          else format('%I = replace(%I, chr(8212), %L)', col.column_name, col.column_name, '-')
        end;
      conditions := conditions || case when conditions = '' then '' else ' or ' end || format('strpos(%I::text, chr(8212)) > 0', col.column_name);
    end loop;
    if arguments <> '' then
      execute format('update public.%I set %s where %s', tab.table_name, assignments, conditions);
      execute format('drop trigger if exists plain_display_fields on public.%I', tab.table_name);
      execute format('create trigger plain_display_fields before insert or update on public.%I for each row execute function public.normalize_display_fields(%s)', tab.table_name, arguments);
    end if;
  end loop;
end $$;
revoke all on function public.plain_display_text(jsonb), public.normalize_display_fields() from public, anon;
grant execute on function public.plain_display_text(jsonb), public.normalize_display_fields() to authenticated;
commit;
