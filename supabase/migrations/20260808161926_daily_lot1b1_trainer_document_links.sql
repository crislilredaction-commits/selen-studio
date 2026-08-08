-- Selen Daily Lot 1B.1 - links trainer profiles to versioned Daily documents.
-- Storage metadata remains owned by daily_documents.

create table if not exists public.daily_trainer_profile_documents (
  id uuid primary key default gen_random_uuid(),
  trainer_profile_id uuid not null references public.daily_trainer_profiles(id) on delete restrict,
  daily_document_id uuid not null references public.daily_documents(id) on delete restrict,
  document_purpose text not null,
  verified_at timestamptz null,
  verified_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_trainer_profile_documents_purpose_check
    check (document_purpose in ('cv', 'qualification', 'identity', 'insurance', 'contract', 'other')),
  constraint daily_trainer_profile_documents_unique
    unique (trainer_profile_id, daily_document_id)
);

create index if not exists daily_trainer_profile_documents_profile_idx
  on public.daily_trainer_profile_documents (trainer_profile_id, created_at desc);

create or replace function public.validate_daily_trainer_profile_document_organisation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  trainer_organisation_id uuid;
  document_organisation_id uuid;
begin
  select organisation_id into trainer_organisation_id
  from public.daily_trainer_profiles
  where id = new.trainer_profile_id;
  if trainer_organisation_id is null then raise exception 'trainer profile not found'; end if;

  select organisation_id into document_organisation_id
  from public.daily_documents
  where id = new.daily_document_id;
  if document_organisation_id is null then raise exception 'Daily document not found'; end if;

  if trainer_organisation_id <> document_organisation_id then
    raise exception 'trainer profile and Daily document must belong to the same organisation';
  end if;
  return new;
end;
$$;

revoke execute on function public.validate_daily_trainer_profile_document_organisation()
  from public, anon, authenticated;
grant execute on function public.validate_daily_trainer_profile_document_organisation()
  to service_role;

drop trigger if exists daily_trainer_profile_documents_validate_organisation
  on public.daily_trainer_profile_documents;
create trigger daily_trainer_profile_documents_validate_organisation
before insert or update of trainer_profile_id, daily_document_id
on public.daily_trainer_profile_documents
for each row execute function public.validate_daily_trainer_profile_document_organisation();

drop trigger if exists daily_trainer_profile_documents_set_updated_at
  on public.daily_trainer_profile_documents;
create trigger daily_trainer_profile_documents_set_updated_at
before update on public.daily_trainer_profile_documents
for each row execute function public.daily_set_updated_at();

alter table public.daily_trainer_profile_documents enable row level security;
revoke all on table public.daily_trainer_profile_documents from public, anon, authenticated;

comment on table public.daily_trainer_profile_documents is
  'Daily Lot 1B.1: association between an organisation trainer profile and a versioned daily_documents record; no duplicate storage path/hash.';
