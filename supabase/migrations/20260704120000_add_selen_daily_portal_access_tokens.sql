create table if not exists public.daily_portal_access_tokens (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.daily_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  portal_type text not null check (portal_type in ('learner', 'enterprise', 'trainer')),
  entity_key text not null,
  entity_name text,
  entity_email text,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'viewed', 'expired')),
  viewed_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, portal_type, entity_key)
);

create index if not exists daily_portal_access_tokens_session_idx
  on public.daily_portal_access_tokens(session_id, portal_type, status);

drop trigger if exists daily_portal_access_tokens_set_updated_at on public.daily_portal_access_tokens;
create trigger daily_portal_access_tokens_set_updated_at
before update on public.daily_portal_access_tokens
for each row execute function public.set_daily_updated_at();

alter table public.daily_portal_access_tokens enable row level security;

drop policy if exists "Clients can read their Daily portal access tokens" on public.daily_portal_access_tokens;
create policy "Clients can read their Daily portal access tokens"
on public.daily_portal_access_tokens for select
to authenticated
using (auth.uid() = user_id);
