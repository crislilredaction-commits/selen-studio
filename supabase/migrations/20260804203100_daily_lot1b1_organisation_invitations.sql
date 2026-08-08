-- Selen Daily Lot 1B.1 - organisation profile change proposals and invitations.
-- Tokens are stored only as hashes. No raw token column is created.

create or replace function public.daily_text_array_has_no_duplicates(p_values text[])
returns boolean
language sql
immutable
security invoker
set search_path = public
as $$
  select coalesce(
    cardinality(p_values) = (
      select count(distinct value)::integer
      from unnest(p_values) as value
    ),
    true
  );
$$;

revoke execute on function public.daily_text_array_has_no_duplicates(text[])
  from public, anon;
grant execute on function public.daily_text_array_has_no_duplicates(text[])
  to authenticated, service_role;

create or replace function public.daily_organisation_profile_change_keys_allowed(
  p_request_type text,
  p_changes jsonb
)
returns boolean
language sql
immutable
security invoker
set search_path = public
as $$
  select case
    when jsonb_typeof(p_changes) <> 'object' then false
    when p_request_type = 'legal_identity' then (
      select bool_and(key in ('legal_name')) from jsonb_object_keys(p_changes) as key
    )
    when p_request_type = 'siret' then (
      select bool_and(key in ('siret')) from jsonb_object_keys(p_changes) as key
    )
    when p_request_type = 'legal_form' then (
      select bool_and(key in ('legal_form')) from jsonb_object_keys(p_changes) as key
    )
    when p_request_type = 'legal_representative' then (
      select bool_and(key in ('legal_representative_name', 'legal_representative_email'))
      from jsonb_object_keys(p_changes) as key
    )
    when p_request_type = 'nda' then (
      select bool_and(key in ('nda_number', 'nda_status', 'nda_declared_at'))
      from jsonb_object_keys(p_changes) as key
    )
    when p_request_type = 'qualiopi' then (
      select bool_and(key in ('qualiopi_status', 'qualiopi_valid_from', 'qualiopi_valid_until', 'qualiopi_categories'))
      from jsonb_object_keys(p_changes) as key
    )
    when p_request_type = 'vat' then (
      select bool_and(key in ('vat_number')) from jsonb_object_keys(p_changes) as key
    )
    else false
  end
  and (select count(*) > 0 from jsonb_object_keys(p_changes));
$$;

revoke execute on function public.daily_organisation_profile_change_keys_allowed(text, jsonb)
  from public, anon;
grant execute on function public.daily_organisation_profile_change_keys_allowed(text, jsonb)
  to authenticated, service_role;

create table if not exists public.daily_organisation_profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid null references auth.users(id) on delete set null,
  status text not null default 'pending',
  request_type text not null,
  proposed_changes jsonb not null,
  review_message text null,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_org_profile_change_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint daily_org_profile_change_requests_type_check
    check (request_type in ('legal_identity','siret','legal_form','legal_representative','nda','qualiopi','vat')),
  constraint daily_org_profile_change_requests_changes_object_check
    check (jsonb_typeof(proposed_changes) = 'object'),
  constraint daily_org_profile_change_requests_allowed_keys_check
    check (public.daily_organisation_profile_change_keys_allowed(request_type, proposed_changes)),
  constraint daily_org_profile_change_requests_review_state_check
    check ((status = 'pending' and reviewed_at is null) or (status <> 'pending' and reviewed_at is not null)),
  constraint daily_org_profile_change_requests_no_secret_check
    check (
      proposed_changes::text !~* '(raw_token|access_token|refresh_token|secret|password)'
      and coalesce(review_message, '') !~* '(raw_token|access_token|refresh_token|secret|password)'
    )
);

create index if not exists daily_org_profile_change_requests_org_status_idx
  on public.daily_organisation_profile_change_requests (organisation_id, status, requested_at desc);

create table if not exists public.daily_organisation_invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  invited_email text not null,
  normalized_email text not null,
  invited_by uuid not null references auth.users(id) on delete restrict,
  intended_roles text[] not null default '{}'::text[],
  intended_permission_blocks text[] not null default '{}'::text[],
  token_hash text not null,
  status text not null default 'pending',
  expires_at timestamptz not null,
  accepted_at timestamptz null,
  accepted_user_id uuid null references auth.users(id) on delete set null,
  revoked_at timestamptz null,
  revoked_by uuid null references auth.users(id) on delete set null,
  superseded_by uuid null,
  resend_count integer not null default 0,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_organisation_invitations_email_check
    check (normalized_email = lower(btrim(invited_email)) and normalized_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint daily_organisation_invitations_token_hash_check
    check (token_hash ~ '^[A-Fa-f0-9]{64}$'),
  constraint daily_organisation_invitations_status_check
    check (status in ('pending','accepted','revoked','expired','superseded')),
  constraint daily_organisation_invitations_roles_check
    check (
      cardinality(intended_roles) > 0
      and intended_roles <@ array['manager','trainer','admin_assistant']::text[]
      and public.daily_text_array_has_no_duplicates(intended_roles)
    ),
  constraint daily_organisation_invitations_permission_blocks_check
    check (
      intended_permission_blocks <@ array['users','trainers','legal_profile','permanent_documents']::text[]
      and public.daily_text_array_has_no_duplicates(intended_permission_blocks)
    ),
  constraint daily_organisation_invitations_expiry_check
    check (expires_at > created_at and expires_at <= created_at + interval '7 days' + interval '5 minutes'),
  constraint daily_organisation_invitations_acceptance_check
    check (
      (status='pending' and accepted_at is null and accepted_user_id is null and revoked_at is null and revoked_by is null and superseded_by is null)
      or (status='accepted' and accepted_at is not null and accepted_user_id is not null and revoked_at is null and revoked_by is null and superseded_by is null)
      or (status='revoked' and accepted_at is null and accepted_user_id is null and revoked_at is not null and revoked_by is not null and superseded_by is null)
      or (status='expired' and accepted_at is null and accepted_user_id is null and revoked_at is null and revoked_by is null and superseded_by is null)
      or (status='superseded' and accepted_at is null and accepted_user_id is null and revoked_at is null and revoked_by is null and superseded_by is not null and superseded_by <> id)
    ),
  constraint daily_organisation_invitations_resend_count_check check (resend_count >= 0)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'daily_organisation_invitations_superseded_by_fkey'
  ) then
    alter table public.daily_organisation_invitations
      add constraint daily_organisation_invitations_superseded_by_fkey
      foreign key (superseded_by)
      references public.daily_organisation_invitations(id)
      on delete set null
      deferrable initially deferred;
  end if;
end;
$$;

create unique index if not exists daily_organisation_invitations_token_hash_unique_idx
  on public.daily_organisation_invitations (token_hash);
create unique index if not exists daily_organisation_invitations_one_pending_email_idx
  on public.daily_organisation_invitations (organisation_id, normalized_email)
  where status = 'pending';
create index if not exists daily_organisation_invitations_org_status_idx
  on public.daily_organisation_invitations (organisation_id, status, expires_at);

drop trigger if exists daily_org_profile_change_requests_set_updated_at on public.daily_organisation_profile_change_requests;
create trigger daily_org_profile_change_requests_set_updated_at
before update on public.daily_organisation_profile_change_requests
for each row execute function public.daily_set_updated_at();

drop trigger if exists daily_organisation_invitations_set_updated_at on public.daily_organisation_invitations;
create trigger daily_organisation_invitations_set_updated_at
before update on public.daily_organisation_invitations
for each row execute function public.daily_set_updated_at();

alter table public.daily_organisation_profile_change_requests enable row level security;
alter table public.daily_organisation_invitations enable row level security;

revoke all on table public.daily_organisation_profile_change_requests from public, anon, authenticated;
revoke all on table public.daily_organisation_invitations from public, anon, authenticated;

comment on table public.daily_organisation_invitations is
  'Daily Lot 1B.1: single-use 7-day organisation invitations with hashed tokens only. Resend creates a new token and supersedes the previous pending invitation.';
