-- Per-week scheduler priority ordering.
-- NULL means the exact legacy/default order defined by the application.

alter table public.weeks
  add column if not exists algorithm_priorities jsonb;

alter table public.weeks
  drop constraint if exists weeks_algorithm_priorities_check;

alter table public.weeks
  add constraint weeks_algorithm_priorities_check check (
    algorithm_priorities is null
    or (
      jsonb_typeof(algorithm_priorities) = 'array'
      and jsonb_array_length(algorithm_priorities) = 7
      and algorithm_priorities <@ '[
        "weekly_balance",
        "premium_boundary_coverage",
        "avoid_prefer_not",
        "fair_wants",
        "avoid_triple_shifts",
        "midweek_type_coverage",
        "avoid_quick_return"
      ]'::jsonb
      and algorithm_priorities @> '[
        "weekly_balance",
        "premium_boundary_coverage",
        "avoid_prefer_not",
        "fair_wants",
        "avoid_triple_shifts",
        "midweek_type_coverage",
        "avoid_quick_return"
      ]'::jsonb
    )
  );

comment on column public.weeks.algorithm_priorities is
  'Optional per-week permutation of scheduler priorities; NULL uses the application default.';

-- Saves or resets the priority order while locking the target week. The
-- published-state check is enforced in the database as well as in the API so
-- a concurrent publish cannot race with a settings update.
create or replace function public.set_week_algorithm_priorities(
  p_week_id uuid,
  p_priorities jsonb
)
returns jsonb
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

  if p_priorities is not null
     and not (
       jsonb_typeof(p_priorities) = 'array'
       and jsonb_array_length(p_priorities) = 7
       and p_priorities <@ '[
         "weekly_balance",
         "premium_boundary_coverage",
         "avoid_prefer_not",
         "fair_wants",
         "avoid_triple_shifts",
         "midweek_type_coverage",
         "avoid_quick_return"
       ]'::jsonb
       and p_priorities @> '[
         "weekly_balance",
         "premium_boundary_coverage",
         "avoid_prefer_not",
         "fair_wants",
         "avoid_triple_shifts",
         "midweek_type_coverage",
         "avoid_quick_return"
       ]'::jsonb
     ) then
    raise exception using
      message = 'INVALID_ALGORITHM_PRIORITIES',
      errcode = '22023';
  end if;

  update public.weeks
  set algorithm_priorities = p_priorities
  where id = p_week_id;

  return p_priorities;
end;
$$;

revoke execute on function public.set_week_algorithm_priorities(uuid, jsonb)
  from public, anon, authenticated;

grant execute on function public.set_week_algorithm_priorities(uuid, jsonb)
  to service_role;
