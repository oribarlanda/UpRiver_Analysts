-- Weekly Shift Scheduler - initial schema
-- Run this once in the Supabase SQL editor (or via `supabase db push`).

create extension if not exists "pgcrypto";

create table if not exists weeks (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  status text not null default 'open' check (status in ('open', 'draft', 'published')),
  premium_days integer[] not null default '{5,6}',
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists preferences (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks(id) on delete cascade,
  employee text not null check (employee in ('hila', 'yaara', 'omer')),
  day_index integer not null check (day_index between 0 and 6),
  shift_type text not null check (shift_type in ('morning', 'afternoon', 'evening')),
  preference text not null check (preference in ('want', 'can', 'prefer_not', 'cannot')),
  updated_at timestamptz not null default now(),
  unique (week_id, employee, day_index, shift_type)
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks(id) on delete cascade,
  day_index integer not null check (day_index between 0 and 6),
  shift_type text not null check (shift_type in ('morning', 'afternoon', 'evening')),
  employee text not null check (employee in ('hila', 'yaara', 'omer')),
  source text not null default 'auto' check (source in ('auto', 'manual')),
  unique (week_id, day_index, shift_type)
);

create index if not exists idx_preferences_week_id on preferences(week_id);
create index if not exists idx_assignments_week_id on assignments(week_id);

-- Row Level Security: enabled with NO policies. All application access goes
-- through the server-side Supabase client using the service role key, which
-- bypasses RLS by design. No anon/authenticated client ever talks to the
-- database directly, so no policies are defined (default-deny for any
-- non-service-role access).
alter table weeks enable row level security;
alter table preferences enable row level security;
alter table assignments enable row level security;
