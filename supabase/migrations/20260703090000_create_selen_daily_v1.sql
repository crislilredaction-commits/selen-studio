create extension if not exists "pgcrypto";

create table if not exists public.daily_formations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  global_objective text not null,
  target_audience text not null,
  prerequisites text not null,
  duration_hours numeric(8,2) not null,
  duration_days numeric(8,2) not null,
  modality text not null check (modality in ('presentiel', 'distanciel', 'mixte')),
  modality_details text not null,
  access_delays text not null,
  registration_methods text not null,
  price text not null,
  detailed_program text not null,
  accessibility text not null,
  disability_referent text,
  pedagogical_resources text not null,
  evaluation_methods text not null,
  result_beneficiary_count integer,
  result_satisfaction_rate numeric(5,2),
  result_success_rate numeric(5,2),
  results_pending boolean not null default false,
  contact_phone text not null,
  contact_email text not null,
  contact_website text,
  updated_visible_at date not null default current_date,
  status text not null default 'draft' check (
    status in ('draft', 'review', 'validated', 'correction_requested', 'archived')
  ),
  validation_note text,
  version integer not null default 1,
  previous_version_id uuid references public.daily_formations(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  formation_id uuid not null references public.daily_formations(id) on delete restrict,
  modality text not null check (modality in ('presentiel', 'distanciel', 'mixte')),
  distance_mode text check (distance_mode in ('synchrone', 'asynchrone')),
  blended_elearning_periods text,
  blended_in_person_days text,
  schedule_blocks jsonb not null default '[]'::jsonb,
  location_address text,
  remote_url text,
  companies jsonb not null default '[]'::jsonb,
  beneficiaries jsonb not null default '[]'::jsonb,
  individual_beneficiaries jsonb not null default '[]'::jsonb,
  status text not null default 'ready' check (status in ('draft', 'ready', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_formations_user_status_idx
  on public.daily_formations(user_id, status, updated_at desc);

create index if not exists daily_sessions_user_formation_idx
  on public.daily_sessions(user_id, formation_id, created_at desc);

create or replace function public.set_daily_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists daily_formations_set_updated_at on public.daily_formations;
create trigger daily_formations_set_updated_at
before update on public.daily_formations
for each row execute function public.set_daily_updated_at();

drop trigger if exists daily_sessions_set_updated_at on public.daily_sessions;
create trigger daily_sessions_set_updated_at
before update on public.daily_sessions
for each row execute function public.set_daily_updated_at();

alter table public.daily_formations enable row level security;
alter table public.daily_sessions enable row level security;

drop policy if exists "Clients can read their Daily formations" on public.daily_formations;
create policy "Clients can read their Daily formations"
on public.daily_formations for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Clients can create their Daily formations" on public.daily_formations;
create policy "Clients can create their Daily formations"
on public.daily_formations for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Clients can update their Daily formations" on public.daily_formations;
create policy "Clients can update their Daily formations"
on public.daily_formations for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Clients can delete their Daily formations" on public.daily_formations;
create policy "Clients can delete their Daily formations"
on public.daily_formations for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Clients can read their Daily sessions" on public.daily_sessions;
create policy "Clients can read their Daily sessions"
on public.daily_sessions for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Clients can create their Daily sessions" on public.daily_sessions;
create policy "Clients can create their Daily sessions"
on public.daily_sessions for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Clients can update their Daily sessions" on public.daily_sessions;
create policy "Clients can update their Daily sessions"
on public.daily_sessions for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Clients can delete their Daily sessions" on public.daily_sessions;
create policy "Clients can delete their Daily sessions"
on public.daily_sessions for delete
to authenticated
using (auth.uid() = user_id);
