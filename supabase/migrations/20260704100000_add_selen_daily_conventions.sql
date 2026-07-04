create table if not exists public.daily_conventions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.daily_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_type text not null check (recipient_type in ('beneficiary', 'company')),
  recipient_key text not null,
  recipient_name text,
  recipient_email text,
  company_name text,
  version integer not null default 1,
  document_name text not null,
  storage_path text not null,
  status text not null default 'generated' check (status in ('generated', 'superseded', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, recipient_type, recipient_key, version)
);

create index if not exists daily_conventions_session_idx
  on public.daily_conventions(session_id, recipient_type, recipient_key, version desc);

drop trigger if exists daily_conventions_set_updated_at on public.daily_conventions;
create trigger daily_conventions_set_updated_at
before update on public.daily_conventions
for each row execute function public.set_daily_updated_at();

alter table public.daily_conventions enable row level security;

drop policy if exists "Clients can read their Daily conventions" on public.daily_conventions;
create policy "Clients can read their Daily conventions"
on public.daily_conventions for select
to authenticated
using (auth.uid() = user_id);
