create table if not exists public.selen_agent_assistance_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  agent_user_id uuid,
  agent_email text,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  dossier_id uuid references public.dossiers(id) on delete cascade,
  status text not null default 'active',
  expires_at timestamptz not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  created_ip text,
  created_user_agent text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists selen_agent_assistance_tokens_lookup_idx
  on public.selen_agent_assistance_tokens (token_hash, status, expires_at);

create index if not exists selen_agent_assistance_tokens_context_idx
  on public.selen_agent_assistance_tokens (organisation_id, dossier_id, created_at desc);

create table if not exists public.selen_agent_assistance_logs (
  id uuid primary key default gen_random_uuid(),
  assistance_token_id uuid references public.selen_agent_assistance_tokens(id) on delete set null,
  agent_user_id uuid,
  agent_email text,
  organisation_id uuid references public.organisations(id) on delete set null,
  dossier_id uuid references public.dossiers(id) on delete set null,
  action text not null,
  action_label text,
  old_state jsonb,
  new_state jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{"mode":"agent_assistance"}'::jsonb
);

create index if not exists selen_agent_assistance_logs_context_idx
  on public.selen_agent_assistance_logs (organisation_id, dossier_id, created_at desc);
