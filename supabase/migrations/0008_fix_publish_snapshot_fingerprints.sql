-- Remove the accidental pgcrypto dependency from schedule publication.
-- Migration 0007 installed the function with search_path=public, while
-- Supabase exposes digest() from the extensions schema. Canonical assignment
-- text is already a stable fingerprint and avoids that runtime dependency.

update public.published_assignment_snapshots as snapshot
set assignment_fingerprint = coalesce((
  select string_agg(
    assignment.day_index::text || ':' || assignment.shift_type,
    ','
    order by assignment.day_index, assignment.shift_type
  )
  from public.assignments as assignment
  where assignment.week_id = snapshot.week_id
    and assignment.employee = snapshot.employee
), ''),
updated_at = now();

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
    coalesce((
      select string_agg(
        assignment.day_index::text || ':' || assignment.shift_type,
        ','
        order by assignment.day_index, assignment.shift_type
      )
      from public.assignments as assignment
      where assignment.week_id = p_week_id
        and assignment.employee = employees.employee
    ), '')
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
