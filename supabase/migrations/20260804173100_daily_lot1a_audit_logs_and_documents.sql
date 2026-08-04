-- Selen Daily Lot 1A - audit log and versioned document metadata.
-- Additive migration only. No Storage object is moved or modified here.

create table if not exists public.daily_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  actor_user_id uuid null references auth.users(id) on delete set null,
  actor_type text not null,
  actor_role text null,
  object_type text not null,
  object_id uuid null,
  action text not null,
  occurred_at timestamptz not null default now(),
  before_data jsonb null,
  after_data jsonb null,
  context jsonb null,
  ip_address inet null,
  user_agent text null,
  origin text not null,
  reason text null,
  created_at timestamptz not null default now(),
  constraint daily_audit_logs_actor_type_check
    check (
      actor_type in (
        'selen_admin',
        'selen_operator',
        'organisation_user',
        'learner',
        'enterprise_contact',
        'automation',
        'public_token'
      )
    ),
  constraint daily_audit_logs_origin_check
    check (origin in ('Studio', 'Vitrine', 'automation', 'import', 'selen_operator')),
  constraint daily_audit_logs_no_raw_token_check
    check (
      coalesce(before_data::text, '') !~* '(raw_token|access_token|refresh_token|secret|password)'
      and coalesce(after_data::text, '') !~* '(raw_token|access_token|refresh_token|secret|password)'
      and coalesce(context::text, '') !~* '(raw_token|access_token|refresh_token|secret|password)'
    )
);

create index if not exists daily_audit_logs_organisation_occurred_idx
  on public.daily_audit_logs (organisation_id, occurred_at desc);

create index if not exists daily_audit_logs_object_idx
  on public.daily_audit_logs (object_type, object_id);

create index if not exists daily_audit_logs_actor_idx
  on public.daily_audit_logs (actor_user_id, occurred_at desc);

create index if not exists daily_audit_logs_action_idx
  on public.daily_audit_logs (action, occurred_at desc);

create or replace function public.prepare_daily_audit_log_insert()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.occurred_at = now();
  new.created_at = now();

  if current_user not in ('postgres', 'service_role') then
    if not public.daily_is_selen_staff() then
      raise exception 'only Selen staff or trusted server roles can append Daily audit logs';
    end if;

    if (select auth.uid()) is null then
      raise exception 'authenticated actor is required to append Daily audit logs';
    end if;

    new.actor_user_id = (select auth.uid());

    if new.actor_type not in ('selen_admin', 'selen_operator') then
      raise exception 'Selen staff audit log actor_type must be selen_admin or selen_operator';
    end if;

    if new.origin not in ('Studio', 'selen_operator') then
      raise exception 'Selen staff audit log origin must be Studio or selen_operator';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.prepare_daily_audit_log_insert() from public, anon, authenticated;
grant execute on function public.prepare_daily_audit_log_insert() to service_role;

create or replace function public.prevent_daily_audit_log_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('postgres', 'service_role') then
    raise exception 'daily_audit_logs is append-only';
  end if;

  if tg_op = 'UPDATE' then
    return new;
  end if;

  return old;
end;
$$;

revoke execute on function public.prevent_daily_audit_log_mutation() from public, anon, authenticated;

drop trigger if exists daily_audit_logs_prepare_insert on public.daily_audit_logs;
create trigger daily_audit_logs_prepare_insert
before insert on public.daily_audit_logs
for each row execute function public.prepare_daily_audit_log_insert();

drop trigger if exists daily_audit_logs_prevent_update on public.daily_audit_logs;
create trigger daily_audit_logs_prevent_update
before update on public.daily_audit_logs
for each row execute function public.prevent_daily_audit_log_mutation();

drop trigger if exists daily_audit_logs_prevent_delete on public.daily_audit_logs;
create trigger daily_audit_logs_prevent_delete
before delete on public.daily_audit_logs
for each row execute function public.prevent_daily_audit_log_mutation();

create or replace function public.daily_append_audit_log(
  p_organisation_id uuid,
  p_actor_type text,
  p_actor_role text,
  p_object_type text,
  p_object_id uuid,
  p_action text,
  p_before_data jsonb default null,
  p_after_data jsonb default null,
  p_context jsonb default null,
  p_ip_address inet default null,
  p_user_agent text default null,
  p_origin text default 'Studio',
  p_reason text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_log_id uuid;
begin
  if not public.daily_is_selen_staff() then
    raise exception 'only Selen staff can append Daily audit logs in Lot 1A';
  end if;

  if (select auth.uid()) is null then
    raise exception 'authenticated actor is required';
  end if;

  if p_actor_type not in ('selen_admin', 'selen_operator') then
    raise exception 'invalid staff actor_type for Daily audit log';
  end if;

  if p_origin not in ('Studio', 'selen_operator') then
    raise exception 'invalid staff origin for Daily audit log';
  end if;

  if not public.can_access_organisation(p_organisation_id) then
    raise exception 'actor cannot access organisation';
  end if;

  insert into public.daily_audit_logs (
    organisation_id,
    actor_user_id,
    actor_type,
    actor_role,
    object_type,
    object_id,
    action,
    before_data,
    after_data,
    context,
    ip_address,
    user_agent,
    origin,
    reason
  )
  values (
    p_organisation_id,
    (select auth.uid()),
    p_actor_type,
    p_actor_role,
    p_object_type,
    p_object_id,
    p_action,
    p_before_data,
    p_after_data,
    p_context,
    p_ip_address,
    p_user_agent,
    p_origin,
    p_reason
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

revoke execute on function public.daily_append_audit_log(
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb,
  inet,
  text,
  text,
  text
) from public, anon;

create table if not exists public.daily_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  document_type text not null,
  linked_object_type text null,
  linked_object_id uuid null,
  version integer not null,
  status text not null default 'draft',
  logical_name text not null,
  bucket text not null,
  storage_path text not null,
  mime_type text null,
  size_bytes bigint null,
  sha256 text null,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz null,
  archived_at timestamptz null,
  is_current boolean not null default true,
  previous_document_id uuid null references public.daily_documents(id) on delete restrict,
  validated_by uuid null references auth.users(id) on delete set null,
  validated_at timestamptz null,
  signed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  constraint daily_documents_version_positive_check
    check (version > 0),
  constraint daily_documents_status_check
    check (
      status in (
        'draft',
        'to_check',
        'to_validate',
        'validated',
        'published',
        'signed',
        'correction_requested',
        'active',
        'archived'
      )
    ),
  constraint daily_documents_size_positive_check
    check (size_bytes is null or size_bytes >= 0),
  constraint daily_documents_sha256_check
    check (sha256 is null or sha256 ~ '^[A-Fa-f0-9]{64}$'),
  constraint daily_documents_storage_path_unique
    unique (storage_path)
);

create unique index if not exists daily_documents_logical_version_unique_idx
  on public.daily_documents (
    organisation_id,
    document_type,
    linked_object_type,
    linked_object_id,
    logical_name,
    version
  )
  nulls not distinct;

create unique index if not exists daily_documents_one_current_idx
  on public.daily_documents (
    organisation_id,
    document_type,
    linked_object_type,
    linked_object_id,
    logical_name
  )
  nulls not distinct
  where is_current = true;

create index if not exists daily_documents_organisation_type_idx
  on public.daily_documents (organisation_id, document_type, status);

create index if not exists daily_documents_linked_object_idx
  on public.daily_documents (linked_object_type, linked_object_id);

create index if not exists daily_documents_archive_idx
  on public.daily_documents (organisation_id, archived_at)
  where archived_at is not null;

create or replace function public.prevent_signed_daily_document_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.signed_at is not null or old.status = 'signed' then
    if new.signed_at is distinct from old.signed_at or new.signed_at is null then
      raise exception 'signed_at cannot be removed or changed on signed Daily documents';
    end if;

    if new.status is distinct from old.status or new.status <> 'signed' then
      raise exception 'signed Daily documents must keep status signed; archive with archived_at only';
    end if;

    if (
      new.organisation_id is distinct from old.organisation_id
      or new.storage_path is distinct from old.storage_path
      or new.bucket is distinct from old.bucket
      or new.mime_type is distinct from old.mime_type
      or new.sha256 is distinct from old.sha256
      or new.size_bytes is distinct from old.size_bytes
      or new.version is distinct from old.version
      or new.logical_name is distinct from old.logical_name
      or new.document_type is distinct from old.document_type
      or new.linked_object_type is distinct from old.linked_object_type
      or new.linked_object_id is distinct from old.linked_object_id
      or new.created_by is distinct from old.created_by
      or new.updated_by is distinct from old.updated_by
      or new.created_at is distinct from old.created_at
      or new.published_at is distinct from old.published_at
      or new.is_current is distinct from old.is_current
      or new.previous_document_id is distinct from old.previous_document_id
      or new.validated_by is distinct from old.validated_by
      or new.validated_at is distinct from old.validated_at
      or new.metadata is distinct from old.metadata
    ) then
      raise exception 'signed Daily documents are immutable except archived_at; create a new version instead';
    end if;
  elsif old.published_at is not null or old.status = 'published' then
    if new.status not in ('published', 'archived') then
      raise exception 'published Daily documents can only remain published or be archived';
    end if;

    if (
      new.organisation_id is distinct from old.organisation_id
      or new.storage_path is distinct from old.storage_path
      or new.bucket is distinct from old.bucket
      or new.mime_type is distinct from old.mime_type
      or new.sha256 is distinct from old.sha256
      or new.size_bytes is distinct from old.size_bytes
      or new.version is distinct from old.version
      or new.logical_name is distinct from old.logical_name
      or new.document_type is distinct from old.document_type
      or new.linked_object_type is distinct from old.linked_object_type
      or new.linked_object_id is distinct from old.linked_object_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
      or new.published_at is distinct from old.published_at
      or new.previous_document_id is distinct from old.previous_document_id
      or new.validated_by is distinct from old.validated_by
      or new.validated_at is distinct from old.validated_at
      or new.signed_at is distinct from old.signed_at
      or new.metadata is distinct from old.metadata
    ) then
      raise exception 'published Daily documents cannot be overwritten; create a new version instead';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.prevent_signed_daily_document_mutation() from public, anon, authenticated;

drop trigger if exists daily_documents_set_updated_at on public.daily_documents;
create trigger daily_documents_set_updated_at
before update on public.daily_documents
for each row execute function public.daily_set_updated_at();

drop trigger if exists daily_documents_prevent_signed_mutation on public.daily_documents;
create trigger daily_documents_prevent_signed_mutation
before update on public.daily_documents
for each row execute function public.prevent_signed_daily_document_mutation();

alter table public.daily_audit_logs enable row level security;
alter table public.daily_documents enable row level security;

drop policy if exists "Selen staff can read Daily audit logs" on public.daily_audit_logs;
create policy "Selen staff can read Daily audit logs"
on public.daily_audit_logs
for select
to authenticated
using (public.daily_is_selen_staff());

drop policy if exists "Selen staff can append Daily audit logs" on public.daily_audit_logs;
create policy "Selen staff can append Daily audit logs"
on public.daily_audit_logs
for insert
to authenticated
with check (public.daily_is_selen_staff());

drop policy if exists "Selen staff can manage Daily documents" on public.daily_documents;
create policy "Selen staff can manage Daily documents"
on public.daily_documents
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists "Members can read their organisation Daily documents" on public.daily_documents;
create policy "Members can read their organisation Daily documents"
on public.daily_documents
for select
to authenticated
using (public.can_access_organisation(organisation_id));

drop policy if exists "Authorised members can create Daily documents" on public.daily_documents;
create policy "Authorised members can create Daily documents"
on public.daily_documents
for insert
to authenticated
with check (public.can_manage_daily_documents(organisation_id));

drop policy if exists "Authorised members can update Daily documents" on public.daily_documents;
create policy "Authorised members can update Daily documents"
on public.daily_documents
for update
to authenticated
using (public.can_manage_daily_documents(organisation_id))
with check (public.can_manage_daily_documents(organisation_id));

revoke all on table public.daily_audit_logs from public, anon, authenticated;
revoke all on table public.daily_documents from public, anon, authenticated;

grant select, insert on table public.daily_audit_logs to authenticated;
grant select, insert, update on table public.daily_documents to authenticated;

grant execute on function public.prevent_daily_audit_log_mutation() to service_role;
grant execute on function public.prevent_signed_daily_document_mutation() to service_role;
grant execute on function public.daily_append_audit_log(
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb,
  inet,
  text,
  text,
  text
) to authenticated;
