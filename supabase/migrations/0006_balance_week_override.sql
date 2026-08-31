-- Optional per-week override for the existing monthly-balance detection.
-- NULL preserves the legacy behavior: a detected balance week is enabled.

alter table public.weeks
  add column if not exists balance_week_enabled_override boolean;

comment on column public.weeks.balance_week_enabled_override is
  'Optional per-week monthly-balance override; NULL keeps detected balance weeks enabled.';

-- Saves the setting while locking the target week. The published-state check
-- is repeated in the database so a concurrent publish cannot race the update.
create or replace function public.set_week_balance_enabled(
  p_week_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  select week.status
    into v_status
  from public.weeks as week
  where week.id = p_week_id
  for update;

  if not found then
    raise exception using
      message = 'WEEK_NOT_FOUND',
      errcode = 'P0001';
  end if;

  if v_status = 'published' then
    raise exception using
      message = 'WEEK_ALREADY_PUBLISHED',
      errcode = 'P0001';
  end if;

  if p_enabled is null then
    raise exception using
      message = 'INVALID_BALANCE_WEEK_SETTING',
      errcode = '22023';
  end if;

  update public.weeks
  set balance_week_enabled_override = p_enabled
  where id = p_week_id;

  return p_enabled;
end;
$$;

revoke execute on function public.set_week_balance_enabled(uuid, boolean)
  from public, anon, authenticated;

grant execute on function public.set_week_balance_enabled(uuid, boolean)
  to service_role;
