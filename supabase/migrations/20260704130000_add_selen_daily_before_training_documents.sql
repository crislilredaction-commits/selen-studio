alter table public.daily_onboarding
  add column if not exists organisation_logo_url text,
  add column if not exists organisation_logo_storage_path text;

create table if not exists public.daily_document_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null check (
    document_type in (
      'convention',
      'convocation',
      'certificat',
      'attestation',
      'reglement_interieur',
      'livret_accueil',
      'politique_handicap',
      'autre'
    )
  ),
  template_source text not null default 'CLIENT' check (template_source in ('SELEN', 'CLIENT')),
  template_name text not null,
  template_version integer not null default 1,
  storage_path text,
  public_url text,
  variable_schema jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, document_type, template_source, template_name, template_version)
);

create table if not exists public.daily_convocations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.daily_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_type text not null check (recipient_type in ('beneficiary', 'company', 'trainer')),
  recipient_key text not null,
  recipient_name text,
  recipient_email text,
  company_name text,
  version integer not null default 1,
  document_name text not null,
  storage_path text not null,
  status text not null default 'generated' check (status in ('generated', 'sent', 'viewed', 'archived')),
  sent_at timestamptz,
  viewed_at timestamptz,
  last_error text,
  template_source text not null default 'SELEN' check (template_source in ('SELEN', 'CLIENT')),
  template_name text not null default 'selen_daily_convocation',
  template_version integer not null default 1,
  variables jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, recipient_type, recipient_key, version)
);

create index if not exists daily_document_templates_user_type_idx
  on public.daily_document_templates(user_id, document_type, status);

create index if not exists daily_convocations_session_idx
  on public.daily_convocations(session_id, recipient_type, status, version desc);

drop trigger if exists daily_document_templates_set_updated_at on public.daily_document_templates;
create trigger daily_document_templates_set_updated_at
before update on public.daily_document_templates
for each row execute function public.set_daily_updated_at();

drop trigger if exists daily_convocations_set_updated_at on public.daily_convocations;
create trigger daily_convocations_set_updated_at
before update on public.daily_convocations
for each row execute function public.set_daily_updated_at();

alter table public.daily_document_templates enable row level security;
alter table public.daily_convocations enable row level security;

drop policy if exists "Clients can read their Daily document templates" on public.daily_document_templates;
create policy "Clients can read their Daily document templates"
on public.daily_document_templates for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Clients can read their Daily convocations" on public.daily_convocations;
create policy "Clients can read their Daily convocations"
on public.daily_convocations for select
to authenticated
using (auth.uid() = user_id);
