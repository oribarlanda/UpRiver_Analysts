-- Tracks whether each employee actually reviewed and confirmed
-- the default-filled preference grid for a given week.
--
-- Confirmation NEVER locks preferences.
-- If a preference changes after confirmation, the row is marked dirty
-- while preserving the previous confirmed_at timestamp.

create table if not exists preference_confirmations (
  week_id uuid not null references weeks(id) on delete cascade,
  employee text not null check (employee in ('hila', 'yaara', 'omer')),
  confirmed_at timestamptz not null default now(),
  changed_since_confirmation boolean not null default false,

  primary key (week_id, employee)
);

alter table preference_confirmations enable row level security;

create or replace function public.mark_preference_confirmation_changed()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    update preference_confirmations
    set changed_since_confirmation = true
    where week_id = NEW.week_id
      and employee = NEW.employee
      and changed_since_confirmation = false;

  elsif NEW.preference is distinct from OLD.preference then
    update preference_confirmations
    set changed_since_confirmation = true
    where week_id = NEW.week_id
      and employee = NEW.employee
      and changed_since_confirmation = false;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_preferences_mark_confirmation_changed
on preferences;

create trigger trg_preferences_mark_confirmation_changed
after insert or update of preference
on preferences
for each row
execute function public.mark_preference_confirmation_changed();

revoke execute
on function public.mark_preference_confirmation_changed()
from public, anon, authenticated;

grant execute
on function public.mark_preference_confirmation_changed()
to service_role;
