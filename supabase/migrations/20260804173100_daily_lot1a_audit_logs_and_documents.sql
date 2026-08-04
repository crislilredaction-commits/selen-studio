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

drop trigger if exists daily_audit_logs_prevent_update on public.daily_audit_logs;
create trigger daily_audit_logs_prevent_update
before update on public.daily_audit_logs
for each row execute function public.prevent_daily_audit_log_mutation();

drop trigger if exists daily_audit_logs_prevent_delete on public.daily_audit_logs;
create trigger daily_audit_logs_prevent_delete
before delete on public.daily_audit_logs
for each row execute function public.prevent_daily_audit_log_mutation();

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
    unique (storage_path),
  constraint daily_documents_logical_version_unique
    unique (
      organisation_id,
      document_type,
      linked_object_type,
      linked_object_id,
      logical_name,
      version
    )
);

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
    if (
      new.storage_path is distinct from old.storage_path
      or new.bucket is distinct from old.bucket
      or new.sha256 is distinct from old.sha256
      or new.size_bytes is distinct from old.size_bytes
      or new.version is distinct from old.version
      or new.logical_name is distinct from old.logical_name
      or new.document_type is distinct from old.document_type
      or new.linked_object_type is distinct from old.linked_object_type
      or new.linked_object_id is distinct from old.linked_object_id
    ) then
      raise exception 'signed Daily documents are immutable; create a new version instead';
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

drop policy if exists "Active managers can read their organisation Daily audit logs" on public.daily_audit_logs;
create policy "Active managers can read their organisation Daily audit logs"
on public.daily_audit_logs
for select
to authenticated
using (
  public.has_organisation_role(organisation_id, 'manager')
);

drop policy if exists "Authorised users can append Daily audit logs" on public.daily_audit_logs;
create policy "Authorised users can append Daily audit logs"
on public.daily_audit_logs
for insert
to authenticated
with check (
  public.daily_is_selen_staff()
  or public.has_active_organisation_membership(organisation_id)
);

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
