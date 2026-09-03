-- Per-employee notification preferences, weekly reminder weekdays and
-- deterministic delivery claims. Push subscriptions remain per device.

create table if not exists public.notification_preferences (
  employee text primary key check (employee in ('hila', 'yaara', 'omer')),
  schedule_published_enabled boolean not null default true,
  schedule_updated_enabled boolean not null default true,
  preference_reminders_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.notification_preferences (employee)
select employee
from unnest(array['hila', 'yaara', 'omer']) as employees(employee)
on conflict (employee) do nothing;

create table if not exists public.notification_preference_reminders (
  id uuid primary key default gen_random_uuid(),
  employee text not null references public.notification_preferences(employee)
    on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  reminder_time time not null check (
    extract(minute from reminder_time) = 0
    and extract(second from reminder_time) = 0
  ),
  created_at timestamptz not null default now(),
  unique (employee, day_of_week, reminder_time)
);

create index if not exists idx_notification_preference_reminders_employee
  on public.notification_preference_reminders(employee);

create table if not exists public.notification_delivery_log (
  delivery_key text primary key,
  employee text not null check (employee in ('hila', 'yaara', 'omer')),
  notification_type text not null check (notification_type = 'preference_reminder'),
  week_id uuid references public.weeks(id) on delete set null,
  scheduled_for timestamptz not null,
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  delivered_devices integer not null default 0 check (delivered_devices >= 0),
  failed_devices integer not null default 0 check (failed_devices >= 0)
);

create index if not exists idx_notification_delivery_log_scheduled_for
  on public.notification_delivery_log(scheduled_for desc);

alter table public.notification_preferences enable row level security;
alter table public.notification_preference_reminders enable row level security;
alter table public.notification_delivery_log enable row level security;

comment on table public.notification_preferences is
  'Employee-level notification choices shared by every subscribed device.';

comment on table public.notification_preference_reminders is
  'Recurring weekly day/hour choices in Asia/Jerusalem for preference reminders.';

comment on table public.notification_delivery_log is
  'Deterministic delivery claims that prevent duplicate reminders across cron retries.';

create or replace function public.save_employee_notification_preferences(
  p_employee text,
  p_schedule_published_enabled boolean,
  p_schedule_updated_enabled boolean,
  p_preference_reminders_enabled boolean,
  p_preference_reminders jsonb
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_employee not in ('hila', 'yaara', 'omer') then
    raise exception using message = 'INVALID_EMPLOYEE', errcode = '22023';
  end if;

  if p_preference_reminders is null
     or jsonb_typeof(p_preference_reminders) <> 'array'
     or jsonb_array_length(p_preference_reminders) > 10 then
    raise exception using message = 'INVALID_PREFERENCE_REMINDERS', errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_preference_reminders) as reminders(item)
    where jsonb_typeof(item) <> 'object'
       or (item->>'dayOfWeek') !~ '^[0-6]$'
       or (item->>'time') !~ '^(?:[01][0-9]|2[0-3]):00$'
  ) then
    raise exception using message = 'INVALID_PREFERENCE_REMINDER_VALUE', errcode = '22023';
  end if;

  if (
    select count(*) <> count(distinct (item->>'dayOfWeek', item->>'time'))
    from jsonb_array_elements(p_preference_reminders) as reminders(item)
  ) then
    raise exception using message = 'DUPLICATE_PREFERENCE_REMINDER', errcode = '22023';
  end if;

  insert into public.notification_preferences (
    employee,
    schedule_published_enabled,
    schedule_updated_enabled,
    preference_reminders_enabled,
    updated_at
  )
  values (
    p_employee,
    p_schedule_published_enabled,
    p_schedule_updated_enabled,
    p_preference_reminders_enabled,
    now()
  )
  on conflict (employee) do update
  set schedule_published_enabled = excluded.schedule_published_enabled,
      schedule_updated_enabled = excluded.schedule_updated_enabled,
      preference_reminders_enabled = excluded.preference_reminders_enabled,
      updated_at = now();

  delete from public.notification_preference_reminders
  where employee = p_employee;

  insert into public.notification_preference_reminders (
    employee,
    day_of_week,
    reminder_time
  )
  select
    p_employee,
    (item->>'dayOfWeek')::integer,
    (item->>'time')::time
  from jsonb_array_elements(p_preference_reminders) as reminders(item);
end;
$$;

revoke execute on function public.save_employee_notification_preferences(
  text, boolean, boolean, boolean, jsonb
) from public, anon, authenticated;

grant execute on function public.save_employee_notification_preferences(
  text, boolean, boolean, boolean, jsonb
) to service_role;

create or replace function public.claim_notification_delivery(
  p_delivery_key text,
  p_employee text,
  p_notification_type text,
  p_week_id uuid,
  p_scheduled_for timestamptz
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_inserted integer;
begin
  insert into public.notification_delivery_log (
    delivery_key,
    employee,
    notification_type,
    week_id,
    scheduled_for
  )
  values (
    p_delivery_key,
    p_employee,
    p_notification_type,
    p_week_id,
    p_scheduled_for
  )
  on conflict (delivery_key) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

revoke execute on function public.claim_notification_delivery(
  text, text, text, uuid, timestamptz
) from public, anon, authenticated;

grant execute on function public.claim_notification_delivery(
  text, text, text, uuid, timestamptz
) to service_role;

create or replace function public.complete_notification_delivery(
  p_delivery_key text,
  p_delivered_devices integer,
  p_failed_devices integer
)
returns void
language sql
set search_path = public
as $$
  update public.notification_delivery_log
  set completed_at = now(),
      delivered_devices = greatest(p_delivered_devices, 0),
      failed_devices = greatest(p_failed_devices, 0)
  where delivery_key = p_delivery_key;
$$;

revoke execute on function public.complete_notification_delivery(
  text, integer, integer
) from public, anon, authenticated;

grant execute on function public.complete_notification_delivery(
  text, integer, integer
) to service_role;
