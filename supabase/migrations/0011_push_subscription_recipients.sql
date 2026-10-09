-- A browser endpoint belongs to a device, not to its last signed-in role.
-- Additive migration: preserve every existing subscription and its current owner.
begin;
create table public.push_subscription_recipients (
  endpoint text not null references public.push_subscriptions(endpoint) on delete cascade,
  employee text not null check (employee in ('hila', 'yaara', 'omer', 'admin')),
  created_at timestamptz not null default now(),
  primary key (endpoint, employee)
);
create index idx_push_subscription_recipients_employee
  on public.push_subscription_recipients(employee);
alter table public.push_subscription_recipients enable row level security;
revoke all on public.push_subscription_recipients from anon, authenticated;
grant select, insert, update, delete on public.push_subscription_recipients to service_role;
insert into public.push_subscription_recipients(endpoint, employee)
  select endpoint, employee from public.push_subscriptions;
comment on table public.push_subscription_recipients is
  'Explicit per-role opt-ins on a device. Signing in must never replace another role.';

create function public.save_push_subscription(
  p_employee text, p_endpoint text, p_p256dh text, p_auth text,
  p_user_agent text, p_subscribe boolean default true
) returns boolean language plpgsql set search_path = public as $$
begin
  if p_employee not in ('hila','yaara','omer','admin') then
    raise exception 'INVALID_SUBSCRIBER';
  end if;
  -- Passive inspection may refresh an existing opt-in, never create one.
  if not p_subscribe and not exists (
    select 1 from public.push_subscription_recipients
    where endpoint = p_endpoint and employee = p_employee
  ) then return false; end if;
  insert into public.push_subscriptions(employee, endpoint, p256dh, auth, user_agent)
    values(p_employee, p_endpoint, p_p256dh, p_auth, p_user_agent)
    on conflict(endpoint) do update set
      p256dh = excluded.p256dh, auth = excluded.auth,
      user_agent = excluded.user_agent, updated_at = now();
  -- Keep the legacy employee column untouched on conflict for rolling deployment.
  if p_subscribe then
    insert into public.push_subscription_recipients(endpoint, employee)
      values(p_endpoint, p_employee) on conflict do nothing;
  end if;
  return exists(select 1 from public.push_subscription_recipients
    where endpoint = p_endpoint and employee = p_employee);
end;
$$;
revoke execute on function public.save_push_subscription(text,text,text,text,text,boolean)
  from public, anon, authenticated;
grant execute on function public.save_push_subscription(text,text,text,text,text,boolean)
  to service_role;
commit;
