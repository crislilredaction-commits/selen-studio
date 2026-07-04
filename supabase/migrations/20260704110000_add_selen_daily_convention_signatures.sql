create table if not exists public.daily_convention_signatures (
  id uuid primary key default gen_random_uuid(),
  convention_id uuid not null references public.daily_conventions(id) on delete cascade,
  session_id uuid not null references public.daily_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  signatory_type text not null check (signatory_type in ('organisme', 'entreprise', 'beneficiaire')),
  signatory_name text,
  signatory_email text,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'viewed', 'signed', 'expired', 'error')),
  consent_text text,
  signature_data text,
  proof_hash text,
  viewed_at timestamptz,
  signed_at timestamptz,
  expires_at timestamptz,
  ip_address text,
  user_agent text,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(convention_id, signatory_type)
);

create index if not exists daily_convention_signatures_convention_idx
  on public.daily_convention_signatures(convention_id, status, signatory_type);

create index if not exists daily_convention_signatures_session_idx
  on public.daily_convention_signatures(session_id, status);

drop trigger if exists daily_convention_signatures_set_updated_at on public.daily_convention_signatures;
create trigger daily_convention_signatures_set_updated_at
before update on public.daily_convention_signatures
for each row execute function public.set_daily_updated_at();

alter table public.daily_convention_signatures enable row level security;

drop policy if exists "Clients can read their Daily convention signatures" on public.daily_convention_signatures;
create policy "Clients can read their Daily convention signatures"
on public.daily_convention_signatures for select
to authenticated
using (auth.uid() = user_id);
