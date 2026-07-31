-- Atomically replaces a week's assignments and moves the week to draft.
-- A failure at any point rolls back the complete function call, preserving
-- both the previous assignments and the previous week status.

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
begin
  select w.status
    into v_status
  from public.weeks as w
  where w.id = p_week_id
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
    from jsonb_array_elements(p_assignments) as item;
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
