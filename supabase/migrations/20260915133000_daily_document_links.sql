-- Studio 3D: allow one physical Daily document to be attached to several business entities
-- without duplicating the storage object or daily_documents row.

create table if not exists public.daily_document_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.daily_documents(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  entity_type text not null check (entity_type in ('organisation','trainer','learner','formation','session','enrolment')),
  entity_id uuid not null,
  created_by_agent_profile_id uuid null references public.agent_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (document_id, entity_type, entity_id)
);

create index if not exists daily_document_links_document_idx
  on public.daily_document_links(document_id);
create index if not exists daily_document_links_org_entity_idx
  on public.daily_document_links(organisation_id, entity_type, entity_id);

alter table public.daily_document_links enable row level security;

comment on table public.daily_document_links is
  'Unified entity attachments for Daily documents. A single daily_documents row/storage object may be linked to several authorised business entities.';
comment on column public.daily_document_links.entity_type is
  'Business entity receiving visibility: organisation, trainer, learner, formation, session or enrolment.';
