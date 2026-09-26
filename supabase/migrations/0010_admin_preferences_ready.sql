-- Reuse the existing device subscriptions, VAPID transport and service worker.
alter table public.push_subscriptions drop constraint push_subscriptions_employee_check;
alter table public.push_subscriptions add constraint push_subscriptions_employee_check
  check (employee in ('hila', 'yaara', 'omer', 'admin'));

create table public.admin_notification_preferences (
  role text primary key check (role = 'admin'),
  all_preferences_confirmed_enabled boolean not null default false
);
alter table public.admin_notification_preferences enable row level security;
insert into public.admin_notification_preferences(role) values ('admin');

alter table public.weeks add column preferences_revision bigint not null default 0;
alter table public.weeks add column admin_notified_preferences_revision bigint;

-- BEFORE INSERT must only lock: an upsert runs it even when its conflict
-- UPDATE is a no-op. Revisions and invalidation belong in the AFTER trigger.
create function public.lock_preferences_week() returns trigger
language plpgsql set search_path = public as $$
begin
  if TG_OP = 'DELETE' then
    perform 1 from public.weeks where id = OLD.week_id for update;
    return OLD;
  end if;
  perform 1 from public.weeks where id = NEW.week_id for update;
  return NEW;
end;
$$;
create trigger trg_preferences_week_lock before insert or update or delete
  on public.preferences for each row execute function public.lock_preferences_week();

-- Serialize preference writes, confirmations and delivery claims on the same week.
-- Actual edits advance the revision, including edit-then-revert and bulk actions.
create function public.advance_preferences_revision() returns trigger
language plpgsql set search_path = public as $$
declare v_week_id uuid; v_employee text;
begin
  if TG_OP = 'UPDATE' and NEW.preference is not distinct from OLD.preference then
    return NEW;
  end if;
  if TG_OP = 'DELETE' then v_week_id := OLD.week_id; v_employee := OLD.employee;
  else v_week_id := NEW.week_id; v_employee := NEW.employee; end if;
  update public.weeks set preferences_revision = preferences_revision + 1 where id = v_week_id;
  update public.preference_confirmations set changed_since_confirmation = true
    where week_id = v_week_id and employee = v_employee and not changed_since_confirmation;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;
drop trigger trg_preferences_mark_confirmation_changed on public.preferences;
create trigger trg_preferences_revision after insert or update of preference or delete
  on public.preferences for each row execute function public.advance_preferences_revision();

-- Shift-structure changes already invalidate confirmations; preserve that signal too.
create function public.reset_admin_ready_on_invalidation() returns trigger
language plpgsql set search_path = public as $$
begin
  if NEW.changed_since_confirmation and not OLD.changed_since_confirmation then
    update public.weeks set admin_notified_preferences_revision = null where id = NEW.week_id;
  end if;
  return NEW;
end;
$$;
create trigger trg_admin_ready_invalidated after update of changed_since_confirmation
  on public.preference_confirmations for each row execute function public.reset_admin_ready_on_invalidation();

create function public.confirm_preferences(p_week_id uuid, p_employee text) returns jsonb
language plpgsql set search_path = public as $$
declare v_status text; v_confirmation public.preference_confirmations;
begin
  if p_employee not in ('hila', 'yaara', 'omer') then raise exception 'INVALID_EMPLOYEE'; end if;
  select status into v_status from public.weeks where id = p_week_id for update;
  if v_status is distinct from 'open' then raise exception 'WEEK_NOT_OPEN'; end if;
  insert into public.preference_confirmations(week_id, employee, confirmed_at, changed_since_confirmation)
    values(p_week_id, p_employee, now(), false)
    on conflict(week_id, employee) do update set confirmed_at = now(), changed_since_confirmation = false
    returning * into v_confirmation;
  return to_jsonb(v_confirmation);
end;
$$;

create function public.claim_admin_preferences_ready(p_week_id uuid) returns boolean
language plpgsql set search_path = public as $$
declare v_week public.weeks;
begin
  select * into v_week from public.weeks where id = p_week_id for update;
  if not found or v_week.status <> 'open' then return false; end if;
  if v_week.admin_notified_preferences_revision = v_week.preferences_revision then return false; end if;
  if not exists(select 1 from public.admin_notification_preferences
    where role = 'admin' and all_preferences_confirmed_enabled) then return false; end if;
  if (select count(*) from public.preference_confirmations where week_id = p_week_id
    and employee in ('hila','yaara','omer') and not changed_since_confirmation) <> 3 then return false; end if;
  update public.weeks set admin_notified_preferences_revision = preferences_revision where id = p_week_id;
  return true;
end;
$$;

revoke execute on function public.advance_preferences_revision() from public, anon, authenticated;
revoke execute on function public.confirm_preferences(uuid,text) from public, anon, authenticated;
revoke execute on function public.claim_admin_preferences_ready(uuid) from public, anon, authenticated;
grant execute on function public.advance_preferences_revision() to service_role;
grant execute on function public.confirm_preferences(uuid,text) to service_role;
grant execute on function public.claim_admin_preferences_ready(uuid) to service_role;

revoke execute on function public.lock_preferences_week() from public, anon, authenticated;
revoke execute on function public.reset_admin_ready_on_invalidation() from public, anon, authenticated;
grant execute on function public.lock_preferences_week() to service_role;
grant execute on function public.reset_admin_ready_on_invalidation() to service_role;
