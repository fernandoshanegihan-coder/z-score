create or replace function public.add_community_marks(p_submission_id uuid, p_marks jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_subject_key text;
  v_mark_value integer;
  v_inserted_count integer;
begin
  if p_submission_id is null
     or coalesce(pg_catalog.jsonb_typeof(p_marks), '') <> 'array'
     or pg_catalog.jsonb_array_length(p_marks) <> 3 then
    raise exception using errcode = '22023', message = 'Exactly three subject marks are required.';
  end if;

  if (select pg_catalog.count(distinct value->>'subjectKey')
      from pg_catalog.jsonb_array_elements(p_marks) as marks(value)) <> 3 then
    raise exception using errcode = '22023', message = 'Choose three different subjects.';
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_marks) as marks(value) loop
    v_subject_key := v_item->>'subjectKey';
    if v_subject_key is null or not exists (
      select 1 from private.subject_catalog as subjects where subjects.subject_key = v_subject_key
    ) then
      raise exception using errcode = '22023', message = 'An unsupported subject was submitted.';
    end if;

    if coalesce(v_item->>'mark', '') !~ '^(100|[0-9]{1,2})$' then
      raise exception using errcode = '22023', message = 'Marks must be whole numbers from 0 to 100.';
    end if;
  end loop;

  insert into private.contribution_batches (submission_id)
  values (p_submission_id)
  on conflict (submission_id) do nothing;
  get diagnostics v_inserted_count = row_count;
  if v_inserted_count = 0 then
    return 'duplicate';
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_marks) as marks(value) loop
    v_subject_key := v_item->>'subjectKey';
    v_mark_value := (v_item->>'mark')::integer;
    insert into private.subject_aggregates as current_stats (
      subject_key, contribution_count, sum_marks, sum_squared_marks, updated_at
    ) values (
      v_subject_key, 1, v_mark_value, v_mark_value * v_mark_value, pg_catalog.now()
    )
    on conflict (subject_key) do update set
      contribution_count = current_stats.contribution_count + 1,
      sum_marks = current_stats.sum_marks + excluded.sum_marks,
      sum_squared_marks = current_stats.sum_squared_marks + excluded.sum_squared_marks,
      updated_at = pg_catalog.now();
  end loop;

  return 'accepted';
end;
$$;

revoke all on function public.add_community_marks(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.add_community_marks(uuid, jsonb) to service_role;
