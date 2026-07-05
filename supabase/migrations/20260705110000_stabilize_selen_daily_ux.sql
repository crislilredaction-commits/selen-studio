alter table public.daily_onboarding
  add column if not exists organisation_logo_url text,
  add column if not exists organisation_logo_storage_path text,
  add column if not exists insee_document_url text,
  add column if not exists qualiopi_certificate_url text,
  add column if not exists nda_or_bpf_document_url text,
  add column if not exists welcome_booklet_url text,
  add column if not exists welcome_booklet_pending boolean not null default false,
  add column if not exists support_tasks jsonb not null default '[]'::jsonb;

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

create index if not exists daily_document_templates_user_type_idx
  on public.daily_document_templates(user_id, document_type, status);

drop trigger if exists daily_document_templates_set_updated_at on public.daily_document_templates;
create trigger daily_document_templates_set_updated_at
before update on public.daily_document_templates
for each row execute function public.set_daily_updated_at();

alter table public.daily_document_templates enable row level security;

drop policy if exists "Clients can read their Daily document templates" on public.daily_document_templates;
create policy "Clients can read their Daily document templates"
on public.daily_document_templates for select
to authenticated
using (auth.uid() = user_id);

alter table public.daily_trainers
  add column if not exists cv_url text,
  add column if not exists trainer_access_status text not null default 'to_prepare' check (
    trainer_access_status in ('to_prepare', 'prepared', 'sent', 'error')
  ),
  add column if not exists trainer_access_error text;

alter table public.daily_formations
  add column if not exists detailed_program_document_url text,
  add column if not exists public_registration_token text,
  add column if not exists public_registration_enabled boolean not null default true,
  add column if not exists spontaneous_registration_task_status text not null default 'none' check (
    spontaneous_registration_task_status in ('none', 'to_attach', 'attached', 'archived')
  );

create unique index if not exists daily_formations_public_registration_token_uidx
  on public.daily_formations(public_registration_token)
  where public_registration_token is not null;

alter table public.daily_sessions
  add column if not exists start_date date,
  add column if not exists end_date date;

create table if not exists public.daily_formation_registration_requests (
  id uuid primary key default gen_random_uuid(),
  formation_id uuid not null references public.daily_formations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  response_type text not null check (response_type in ('beneficiary', 'company')),
  respondent_first_name text,
  respondent_last_name text,
  respondent_email text,
  company_name text,
  participants jsonb not null default '[]'::jsonb,
  need_answers jsonb not null default '{}'::jsonb,
  positioning_answers jsonb not null default '{}'::jsonb,
  adaptation_needed boolean not null default false,
  status text not null default 'to_attach' check (status in ('to_attach', 'attached', 'archived')),
  submitted_at timestamptz not null default now(),
  attached_session_id uuid references public.daily_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_formation_registration_requests_user_status_idx
  on public.daily_formation_registration_requests(user_id, status, submitted_at desc);

drop trigger if exists daily_formation_registration_requests_set_updated_at on public.daily_formation_registration_requests;
create trigger daily_formation_registration_requests_set_updated_at
before update on public.daily_formation_registration_requests
for each row execute function public.set_daily_updated_at();

alter table public.daily_formation_registration_requests enable row level security;

drop policy if exists "Clients can read their Daily formation registration requests" on public.daily_formation_registration_requests;
create policy "Clients can read their Daily formation registration requests"
on public.daily_formation_registration_requests for select
to authenticated
using (auth.uid() = user_id);
