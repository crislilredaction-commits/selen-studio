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

-- The importer uses service-role privileges, so RLS alone cannot protect tenant integrity.
-- Every link must therefore be checked against the authoritative Daily entities before insert/update.
create or replace function public.daily_validate_document_link()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_document_org uuid;
  v_entity_org uuid;
begin
  select d.organisation_id into v_document_org
  from public.daily_documents d
  where d.id = new.document_id;

  if v_document_org is null or v_document_org <> new.organisation_id then
    raise exception 'daily_document_links: document does not belong to organisation';
  end if;

  case new.entity_type
    when 'organisation' then
      if new.entity_id <> new.organisation_id then
        raise exception 'daily_document_links: organisation entity mismatch';
      end if;
      v_entity_org := new.organisation_id;
    when 'trainer' then
      select t.organisation_id into v_entity_org from public.daily_trainers t where t.id = new.entity_id;
    when 'learner' then
      select l.organisation_id into v_entity_org from public.daily_learners l where l.id = new.entity_id;
    when 'formation' then
      select f.organisation_id into v_entity_org from public.daily_formations f where f.id = new.entity_id;
    when 'session' then
      select s.organisation_id into v_entity_org from public.daily_sessions s where s.id = new.entity_id;
    when 'enrolment' then
      select e.organisation_id into v_entity_org from public.daily_enrolments e where e.id = new.entity_id;
    else
      raise exception 'daily_document_links: unsupported entity type';
  end case;

  if v_entity_org is null or v_entity_org <> new.organisation_id then
    raise exception 'daily_document_links: entity does not belong to organisation';
  end if;

  return new;
end;
$$;

create trigger daily_document_links_validate_tenant
before insert or update of document_id, organisation_id, entity_type, entity_id
on public.daily_document_links
for each row execute function public.daily_validate_document_link();

comment on table public.daily_document_links is
  'Unified entity attachments for Daily documents. A single daily_documents row/storage object may be linked to several authorised business entities.';
comment on column public.daily_document_links.entity_type is
  'Business entity receiving visibility: organisation, trainer, learner, formation, session or enrolment.';
