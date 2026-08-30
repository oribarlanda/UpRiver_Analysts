-- Configurable daily shift structure.
--
-- `app_settings.shift_definitions` is the global template. Every week owns a
-- JSON snapshot so draft/published schedules keep their original pay values,
-- labels and calendar times when the global template changes later.

create table if not exists public.app_settings (
  id text primary key check (id = 'global'),
  shift_definitions jsonb not null,
  updated_at timestamptz not null default now(),

  constraint app_settings_shift_definitions_array_check check (
    jsonb_typeof(shift_definitions) = 'array'
    and jsonb_array_length(shift_definitions) between 1 and 5
  )
);

alter table public.app_settings enable row level security;

insert into public.app_settings (id, shift_definitions)
values (
  'global',
  '[
    {"id":"morning","name":"בוקר","payValue":1.25,"startTime":"08:00","durationMinutes":60},
    {"id":"afternoon","name":"צהריים","payValue":0.5,"startTime":"14:00","durationMinutes":30},
    {"id":"evening","name":"ערב","payValue":1.25,"startTime":"21:00","durationMinutes":60}
  ]'::jsonb
)
on conflict (id) do nothing;

alter table public.weeks
  add column if not exists shift_definitions jsonb;

update public.weeks
set shift_definitions = (
  select settings.shift_definitions
  from public.app_settings as settings
  where settings.id = 'global'
)
where shift_definitions is null;

alter table public.weeks
  alter column shift_definitions set default '[
    {"id":"morning","name":"בוקר","payValue":1.25,"startTime":"08:00","durationMinutes":60},
    {"id":"afternoon","name":"צהריים","payValue":0.5,"startTime":"14:00","durationMinutes":30},
    {"id":"evening","name":"ערב","payValue":1.25,"startTime":"21:00","durationMinutes":60}
  ]'::jsonb,
  alter column shift_definitions set not null;

alter table public.weeks
  add constraint weeks_shift_definitions_array_check check (
    jsonb_typeof(shift_definitions) = 'array'
    and jsonb_array_length(shift_definitions) between 1 and 5
  );

-- Shift identifiers are now validated against each week's JSON snapshot.
alter table public.preferences
  drop constraint if exists preferences_shift_type_check;

alter table public.assignments
  drop constraint if exists assignments_shift_type_check;

-- Creates a week while holding a shared lock on the current settings row.
-- Settings replacement takes an exclusive lock on the same row, so a week
-- can never be inserted with a stale snapshot during a concurrent save.
create or replace function public.create_week_if_absent(
  p_week_start date,
  p_premium_days integer[]
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_shift_definitions jsonb;
begin
  select settings.shift_definitions
  into v_shift_definitions
  from public.app_settings as settings
  where settings.id = 'global'
  for share;

  if v_shift_definitions is null then
    raise exception using message = 'SHIFT_SETTINGS_NOT_FOUND', errcode = 'P0001';
  end if;

  insert into public.weeks (
    week_start,
    status,
    premium_days,
    shift_definitions
  )
  values (
    p_week_start,
    'open',
    p_premium_days,
    v_shift_definitions
  )
  on conflict (week_start) do nothing;
end;
$$;

revoke execute on function public.create_week_if_absent(date, integer[])
  from public, anon, authenticated;

grant execute on function public.create_week_if_absent(date, integer[])
  to service_role;

-- Replaces the global shift template as one transaction. Only open weeks are
-- updated; draft/published weeks intentionally retain their historical
-- snapshots. Removing a shift also removes its open-week data and marks any
-- prior employee confirmation as changed.
create or replace function public.replace_shift_settings(
  p_shift_definitions jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
  v_normalized jsonb;
  v_previous jsonb;
begin
  if p_shift_definitions is null
     or jsonb_typeof(p_shift_definitions) <> 'array' then
    raise exception using
      message = 'INVALID_SHIFT_DEFINITIONS_PAYLOAD',
      errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_shift_definitions);

  if v_count < 1 or v_count > 5 then
    raise exception using
      message = 'INVALID_SHIFT_DEFINITIONS_COUNT',
      errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_shift_definitions) as definitions(item)
    where jsonb_typeof(item) <> 'object'
       or jsonb_typeof(item->'id') is distinct from 'string'
       or jsonb_typeof(item->'name') is distinct from 'string'
       or jsonb_typeof(item->'payValue') is distinct from 'number'
       or jsonb_typeof(item->'startTime') is distinct from 'string'
       or jsonb_typeof(item->'durationMinutes') is distinct from 'number'
  ) then
    raise exception using
      message = 'INVALID_SHIFT_DEFINITION_SHAPE',
      errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_shift_definitions) as definitions(item)
    where length(item->>'id') not between 1 and 32
       or (item->>'id') !~ '^[a-z0-9_]+$'
       or length(btrim(item->>'name')) not between 1 and 50
       or (item->>'payValue')::numeric < 0.125
       or (item->>'payValue')::numeric > 24
       or (item->>'payValue')::numeric * 8
            <> trunc((item->>'payValue')::numeric * 8)
       or (item->>'startTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (item->>'durationMinutes')::numeric
            <> trunc((item->>'durationMinutes')::numeric)
       or (item->>'durationMinutes')::numeric not between 5 and 1440
  ) then
    raise exception using
      message = 'INVALID_SHIFT_DEFINITION_VALUE',
      errcode = '22023';
  end if;

  if (
    select count(*) <> count(distinct item->>'id')
    from jsonb_array_elements(p_shift_definitions) as definitions(item)
  ) then
    raise exception using
      message = 'DUPLICATE_SHIFT_ID',
      errcode = '22023';
  end if;

  if (
    select count(*) <> count(distinct lower(btrim(item->>'name')))
    from jsonb_array_elements(p_shift_definitions) as definitions(item)
  ) then
    raise exception using
      message = 'DUPLICATE_SHIFT_NAME',
      errcode = '22023';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', item->>'id',
      'name', btrim(item->>'name'),
      'payValue', (item->>'payValue')::numeric,
      'startTime', item->>'startTime',
      'durationMinutes', (item->>'durationMinutes')::integer
    )
    order by ordinal
  )
  into v_normalized
  from jsonb_array_elements(p_shift_definitions)
    with ordinality as definitions(item, ordinal);

  -- Ensure the singleton exists, then lock it to serialize concurrent saves.
  insert into public.app_settings (id, shift_definitions)
  values ('global', v_normalized)
  on conflict (id) do nothing;

  select settings.shift_definitions
  into v_previous
  from public.app_settings as settings
  where settings.id = 'global'
  for update;

  if v_previous is not distinct from v_normalized then
    return v_normalized;
  end if;

  update public.app_settings
  set shift_definitions = v_normalized,
      updated_at = now()
  where id = 'global';

  update public.weeks
  set shift_definitions = v_normalized
  where status = 'open';

  delete from public.preferences as preference
  using public.weeks as week
  where preference.week_id = week.id
    and week.status = 'open'
    and not exists (
      select 1
      from jsonb_array_elements(v_normalized) as definitions(item)
      where item->>'id' = preference.shift_type
    );

  delete from public.assignments as assignment
  using public.weeks as week
  where assignment.week_id = week.id
    and week.status = 'open'
    and not exists (
      select 1
      from jsonb_array_elements(v_normalized) as definitions(item)
      where item->>'id' = assignment.shift_type
    );

  update public.preference_confirmations as confirmation
  set changed_since_confirmation = true
  from public.weeks as week
  where confirmation.week_id = week.id
    and week.status = 'open'
    and confirmation.changed_since_confirmation = false;

  return v_normalized;
end;
$$;

revoke execute on function public.replace_shift_settings(jsonb)
  from public, anon, authenticated;

grant execute on function public.replace_shift_settings(jsonb)
  to service_role;

-- Keep assignment replacement atomic while additionally enforcing that every
-- supplied shift identifier belongs to the target week's immutable snapshot.
create or replace function public.replace_week_assignments(
  p_week_id uuid,
  p_assignments jsonb
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_shift_definitions jsonb;
begin
  select week.status,
         week.shift_definitions
    into v_status,
         v_shift_definitions
  from public.weeks as week
  where week.id = p_week_id
  for update;

  if not found then
    raise exception using message = 'WEEK_NOT_FOUND', errcode = 'P0001';
  end if;

  if v_status = 'published' then
    raise exception using message = 'WEEK_ALREADY_PUBLISHED', errcode = 'P0001';
  end if;

  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array' then
    raise exception using message = 'INVALID_ASSIGNMENTS_PAYLOAD', errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_assignments) as assignments(item)
    where jsonb_typeof(item) <> 'object'
       or jsonb_typeof(item->'shift_type') is distinct from 'string'
       or not exists (
         select 1
         from jsonb_array_elements(v_shift_definitions) as definitions(definition)
         where definition->>'id' = item->>'shift_type'
       )
  ) then
    raise exception using message = 'SHIFT_NOT_CONFIGURED_FOR_WEEK', errcode = '22023';
  end if;

  delete from public.assignments
  where week_id = p_week_id;

  if jsonb_array_length(p_assignments) > 0 then
    insert into public.assignments (
      week_id,
      day_index,
      shift_type,
      employee,
      source
    )
    select
      p_week_id,
      (item->>'day_index')::integer,
      item->>'shift_type',
      item->>'employee',
      coalesce(item->>'source', 'auto')
    from jsonb_array_elements(p_assignments) as assignments(item);
  end if;

  update public.weeks
  set status = 'draft',
      published_at = null
  where id = p_week_id;
end;
$$;

revoke execute on function public.replace_week_assignments(uuid, jsonb)
  from public, anon, authenticated;

grant execute on function public.replace_week_assignments(uuid, jsonb)
  to service_role;
