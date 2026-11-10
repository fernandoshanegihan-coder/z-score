alter table private.contribution_batches
  add column if not exists marks jsonb;

create table if not exists private.contribution_rate_limits (
  rate_key text not null,
  window_started_at timestamptz not null,
  submission_count integer not null default 0 check (submission_count >= 0),
  primary key (rate_key, window_started_at)
);

alter table private.contribution_rate_limits enable row level security;
revoke all on private.contribution_rate_limits from public, anon, authenticated;

create or replace function public.cleanup_community_review_data()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired_count integer;
begin
  delete from private.contribution_rate_limits
  where window_started_at < pg_catalog.now() - interval '48 hours';

  update private.contribution_batches
  set marks = null
  where created_at < pg_catalog.now() - interval '30 days'
    and marks is not null;
  get diagnostics v_expired_count = row_count;
  return v_expired_count;
end;
$$;

create or replace function public.check_community_rate_limit(p_rate_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := pg_catalog.date_trunc('hour', pg_catalog.now());
  v_count integer;
begin
  if p_rate_key is null or p_rate_key !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid rate limit key.';
  end if;

  delete from private.contribution_rate_limits
  where window_started_at < pg_catalog.now() - interval '48 hours';

  insert into private.contribution_rate_limits as current_limit (
    rate_key, window_started_at, submission_count
  ) values (p_rate_key, v_window, 1)
  on conflict (rate_key, window_started_at) do update set
    submission_count = current_limit.submission_count + 1
  returning submission_count into v_count;

  return v_count <= 10;
end;
$$;

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

  -- Retain opted-in marks for review for 30 days; keep older aggregate-only records.
  update private.contribution_batches
  set marks = null
  where created_at < pg_catalog.now() - interval '30 days'
    and marks is not null;

  insert into private.contribution_batches (submission_id, marks)
  values (p_submission_id, p_marks)
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

create or replace function public.remove_community_marks(p_submission_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marks jsonb;
  v_item jsonb;
  v_subject_key text;
  v_mark_value integer;
begin
  select batches.marks into v_marks
  from private.contribution_batches as batches
  where batches.submission_id = p_submission_id
  for update;

  if not found then
    return 'not_found';
  end if;
  if v_marks is null then
    return 'review_window_expired_or_legacy';
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(v_marks) as marks(value) loop
    v_subject_key := v_item->>'subjectKey';
    v_mark_value := (v_item->>'mark')::integer;

    update private.subject_aggregates as current_stats
    set contribution_count = current_stats.contribution_count - 1,
        sum_marks = current_stats.sum_marks - v_mark_value,
        sum_squared_marks = current_stats.sum_squared_marks - (v_mark_value * v_mark_value),
        updated_at = pg_catalog.now()
    where current_stats.subject_key = v_subject_key
      and current_stats.contribution_count > 0;

    if not found then
      raise exception using errcode = '55000', message = 'Aggregate totals are inconsistent.';
    end if;
  end loop;

  delete from private.contribution_batches where submission_id = p_submission_id;
  return 'removed';
end;
$$;

revoke all on function public.check_community_rate_limit(text) from public, anon, authenticated;
revoke all on function public.cleanup_community_review_data() from public, anon, authenticated;
revoke all on function public.add_community_marks(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.remove_community_marks(uuid) from public, anon, authenticated;
grant execute on function public.check_community_rate_limit(text) to service_role;
grant execute on function public.cleanup_community_review_data() to service_role;
grant execute on function public.add_community_marks(uuid, jsonb) to service_role;
grant execute on function public.remove_community_marks(uuid) to service_role;
