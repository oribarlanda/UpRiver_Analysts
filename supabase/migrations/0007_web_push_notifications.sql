-- Web Push subscriptions and per-employee published assignment snapshots.
-- All access stays server-side through the service-role Supabase client.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  employee text not null check (employee in ('hila', 'yaara', 'omer')),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0)
);

create index if not exists idx_push_subscriptions_employee
  on public.push_subscriptions(employee);

alter table public.push_subscriptions enable row level security;

comment on table public.push_subscriptions is
  'Opt-in Web Push devices. The unique endpoint may be re-associated to the currently authenticated employee.';

create or replace function public.record_push_subscription_failure(
  p_endpoint text
)
returns void
language sql
set search_path = public
as $$
  update public.push_subscriptions
  set last_failure_at = now(),
      failure_count = failure_count + 1
  where endpoint = p_endpoint;
$$;

revoke execute on function public.record_push_subscription_failure(text)
  from public, anon, authenticated;

grant execute on function public.record_push_subscription_failure(text)
  to service_role;

create table if not exists public.published_assignment_snapshots (
  week_id uuid not null references public.weeks(id) on delete cascade,
  employee text not null check (employee in ('hila', 'yaara', 'omer')),
  assignment_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (week_id, employee)
);

alter table public.published_assignment_snapshots enable row level security;

comment on table public.published_assignment_snapshots is
  'Last successfully published assignment fingerprint per employee and week, retained through reopen flows.';

-- Preserve the currently published state as the baseline when this feature
-- is introduced to an existing deployment.
insert into public.published_assignment_snapshots (
  week_id,
  employee,
  assignment_fingerprint
)
select
  week.id,
  employees.employee,
  encode(
    digest(
      coalesce((
        select string_agg(
          assignment.day_index::text || ':' || assignment.shift_type,
          ','
          order by assignment.day_index, assignment.shift_type
        )
        from public.assignments as assignment
        where assignment.week_id = week.id
          and assignment.employee = employees.employee
      ), ''),
      'sha256'
    ),
    'hex'
  )
from public.weeks as week
cross join unnest(array['hila', 'yaara', 'omer']) as employees(employee)
where week.status = 'published'
on conflict (week_id, employee) do nothing;

-- Publishes the week and updates all employee snapshots in one transaction.
-- The returned diff is compared with the previous publication, so draft edits
-- never generate notification spam and a no-op re-publication stays silent.
create or replace function public.publish_week_with_assignment_snapshots(
  p_week_id uuid
)
returns table (
  first_publication boolean,
  changed_employees text[]
)
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_shift_definitions jsonb;
  v_expected_count integer;
  v_assignment_count integer;
  v_first_publication boolean;
  v_changed_employees text[];
  v_current_fingerprints jsonb;
begin
  select week.status, week.shift_definitions
    into v_status, v_shift_definitions
  from public.weeks as week
  where week.id = p_week_id
  for update;

  if not found then
    raise exception using message = 'WEEK_NOT_FOUND', errcode = 'P0001';
  end if;

  if v_status <> 'draft' then
    raise exception using message = 'WEEK_NOT_DRAFT', errcode = 'P0001';
  end if;

  v_expected_count := 7 * jsonb_array_length(v_shift_definitions);

  select count(*)
    into v_assignment_count
  from public.assignments as assignment
  where assignment.week_id = p_week_id;

  if v_assignment_count <> v_expected_count then
    raise exception using message = 'MISSING_ASSIGNMENTS', errcode = 'P0001';
  end if;

  select jsonb_object_agg(
    employees.employee,
    encode(
      digest(
        coalesce((
          select string_agg(
            assignment.day_index::text || ':' || assignment.shift_type,
            ','
            order by assignment.day_index, assignment.shift_type
          )
          from public.assignments as assignment
          where assignment.week_id = p_week_id
            and assignment.employee = employees.employee
        ), ''),
        'sha256'
      ),
      'hex'
    )
  )
  into v_current_fingerprints
  from unnest(array['hila', 'yaara', 'omer']) as employees(employee);

  select not exists (
    select 1
    from public.published_assignment_snapshots as snapshot
    where snapshot.week_id = p_week_id
  )
  into v_first_publication;

  if v_first_publication then
    v_changed_employees := array[]::text[];
  else
    select coalesce(array_agg(employees.employee order by employees.employee), array[]::text[])
      into v_changed_employees
    from unnest(array['hila', 'yaara', 'omer']) as employees(employee)
    left join public.published_assignment_snapshots as snapshot
      on snapshot.week_id = p_week_id
     and snapshot.employee = employees.employee
    where snapshot.assignment_fingerprint is distinct from
      (v_current_fingerprints ->> employees.employee);
  end if;

  update public.weeks
  set status = 'published',
      published_at = now()
  where id = p_week_id;

  insert into public.published_assignment_snapshots (
    week_id,
    employee,
    assignment_fingerprint,
    updated_at
  )
  select
    p_week_id,
    fingerprints.key,
    fingerprints.value,
    now()
  from jsonb_each_text(v_current_fingerprints) as fingerprints
  on conflict (week_id, employee) do update
  set assignment_fingerprint = excluded.assignment_fingerprint,
      updated_at = excluded.updated_at;

  return query
  select v_first_publication, v_changed_employees;
end;
$$;

revoke execute on function public.publish_week_with_assignment_snapshots(uuid)
  from public, anon, authenticated;

grant execute on function public.publish_week_with_assignment_snapshots(uuid)
  to service_role;
