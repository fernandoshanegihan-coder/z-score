create schema if not exists private;

create table if not exists private.subject_catalog (
  subject_key text primary key
);

insert into private.subject_catalog (subject_key) values
  ('physics'), ('chemistry'), ('accounting'), ('economics'), ('biology'), ('ict'),
  ('businessStudies'), ('combinedMaths'), ('geography'), ('sinhala'),
  ('communicationMedia'), ('politicalScience'), ('scienceForTechnology'),
  ('engineeringTechnology'), ('buddhistCivilization'), ('tamil'),
  ('agriculturalScience'), ('homeEconomics'), ('bioSystemsTechnology'),
  ('historyIndia'), ('islam'), ('logic'), ('dancingIndigenous'), ('art'),
  ('historyEurope'), ('japanese'), ('hinduCivilization'), ('islamicCivilization'),
  ('dramaSinhala'), ('orientalMusic'), ('arabic'), ('christianity'), ('english'),
  ('dramaTamil'), ('buddhism'), ('french'), ('christianCivilization'),
  ('carnaticMusic'), ('pali'), ('dancingBharatha'), ('businessStatistics'),
  ('mathematics'), ('german'), ('sanskrit'), ('hinduism'), ('agroTechnology'),
  ('chinese'), ('hindi'), ('greekRomanCivilization'), ('historyWorld'),
  ('foodTechnology'), ('westernMusic'), ('russian'), ('bioResourceTechnology'),
  ('electricalTechnology'), ('civilTechnology'), ('mechanicalTechnology')
on conflict (subject_key) do nothing;

create table if not exists private.subject_aggregates (
  subject_key text primary key references private.subject_catalog(subject_key),
  contribution_count bigint not null default 0 check (contribution_count >= 0),
  sum_marks bigint not null default 0 check (sum_marks >= 0),
  sum_squared_marks bigint not null default 0 check (sum_squared_marks >= 0),
  updated_at timestamptz not null default now()
);

-- Keep only sufficient statistics; individual marks are not persisted.
create table if not exists private.contribution_batches (
  submission_id uuid primary key,
  created_at timestamptz not null default now()
);

alter table private.subject_catalog enable row level security;
alter table private.subject_aggregates enable row level security;
alter table private.contribution_batches enable row level security;
revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

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

create or replace function public.get_community_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'subjectKey', subjects.subject_key,
        'contributionCount', coalesce(stats.contribution_count, 0),
        'mean', case
          when coalesce(stats.contribution_count, 0) >= 101
            then pg_catalog.round(stats.sum_marks::numeric / stats.contribution_count, 6)
          else null
        end,
        'standardDeviation', case
          when coalesce(stats.contribution_count, 0) >= 101
            then pg_catalog.round(
              pg_catalog.sqrt(greatest(
                stats.sum_squared_marks::numeric
                  - (stats.sum_marks::numeric * stats.sum_marks::numeric / stats.contribution_count),
                0
              ) / (stats.contribution_count - 1)),
              6
            )
          else null
        end,
        'ready', coalesce(stats.contribution_count, 0) >= 101
          and (stats.sum_squared_marks::numeric
            - (stats.sum_marks::numeric * stats.sum_marks::numeric / stats.contribution_count)) > 0
      ) order by subjects.subject_key
    ),
    '[]'::jsonb
  )
  from private.subject_catalog as subjects
  left join private.subject_aggregates as stats using (subject_key);
$$;

revoke all on function public.add_community_marks(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.get_community_stats() from public, anon, authenticated;
grant execute on function public.add_community_marks(uuid, jsonb) to service_role;
grant execute on function public.get_community_stats() to service_role;
