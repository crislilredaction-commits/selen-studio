create table public.daily_communications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  session_id uuid references public.daily_sessions(id) on delete restrict,
  enrolment_id uuid references public.daily_session_enrolments(id) on delete restrict,
  communication_type text not null,
  channel text not null default 'email' check (channel in ('email')),
  recipient_email text not null,
  recipient_name text,
  subject text not null,
  text_body text not null,
  html_body text,
  provider text not null default 'resend',
  provider_message_id text,
  status text not null default 'sent' check (status in ('queued','sent','delivered','bounced','failed')),
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint daily_communications_recipient_email_not_blank check (length(btrim(recipient_email)) > 0),
  constraint daily_communications_subject_not_blank check (length(btrim(subject)) > 0),
  constraint daily_communications_sent_state check ((status in ('sent','delivered','bounced') and sent_at is not null) or status in ('queued','failed'))
);

create table public.daily_communication_documents (
  communication_id uuid not null references public.daily_communications(id) on delete restrict,
  document_id uuid not null references public.daily_documents(id) on delete restrict,
  document_type text not null,
  logical_name text not null,
  document_version integer not null,
  sha256 text,
  storage_path text not null,
  created_at timestamptz not null default now(),
  primary key (communication_id, document_id)
);

create index daily_communications_organisation_sent_idx on public.daily_communications (organisation_id, sent_at desc);
create index daily_communications_session_sent_idx on public.daily_communications (session_id, sent_at desc) where session_id is not null;
create index daily_communications_enrolment_sent_idx on public.daily_communications (enrolment_id, sent_at desc) where enrolment_id is not null;
create unique index daily_communications_provider_message_uidx on public.daily_communications (provider, provider_message_id) where provider_message_id is not null;
create index daily_communication_documents_document_idx on public.daily_communication_documents (document_id);

alter table public.daily_communications enable row level security;
alter table public.daily_communication_documents enable row level security;

revoke all on public.daily_communications from public, anon, authenticated;
revoke all on public.daily_communication_documents from public, anon, authenticated;
grant select, insert, update on public.daily_communications to service_role;
grant select, insert on public.daily_communication_documents to service_role;

comment on table public.daily_communications is 'Registre canonique des communications métier Daily, conservant le contenu exact et les métadonnées utiles comme preuve d audit.';
comment on table public.daily_communication_documents is 'Snapshots des versions exactes des documents Daily joints ou liés à une communication.';
