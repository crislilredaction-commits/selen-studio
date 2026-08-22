-- DRAFT ONLY — DO NOT APPLY AS A MIGRATION YET.
--
-- Purpose: harden the ten legacy public tables identified by the August 2026
-- access audit while preserving the inspected NDA server-side flows.
--
-- This script is intentionally stored under docs/security rather than
-- supabase/migrations. It must first pass transactional rollback tests and
-- regression checks before being promoted to a real migration.
--
-- Design assumptions already verified:
--   * NDA client routes use server-side service-role access only after explicit
--     dossier / organisation access checks.
--   * service_role bypasses RLS, so those controlled routes remain available.
--   * authenticated direct writes are reserved to active Selen staff.
--   * organisation clients may only read rows belonging to an organisation for
--     which they have an active membership, and only where explicitly allowed.
--   * anon receives no direct access to these historical tables.

-- ---------------------------------------------------------------------------
-- 1. Enable RLS on every legacy table exposed through public.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.dossiers enable row level security;
alter table public.dossier_assignments enable row level security;
alter table public.formations enable row level security;
alter table public.documents enable row level security;
alter table public.nda_variables enable row level security;
alter table public.messages enable row level security;
alter table public.internal_messages enable row level security;
alter table public.program_ai_analyses enable row level security;
alter table public.dossier_program_versions enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Remove direct anonymous access and dangerous authenticated privileges.
--    Keep normal authenticated DML grants temporarily so existing Studio code
--    can continue to reach the tables; RLS below limits those writes to staff.
--    A later grant-minimisation pass may revoke unused DML after regression
--    coverage proves it is unnecessary.
-- ---------------------------------------------------------------------------

revoke all privileges on table public.profiles from anon;
revoke all privileges on table public.dossiers from anon;
revoke all privileges on table public.dossier_assignments from anon;
revoke all privileges on table public.formations from anon;
revoke all privileges on table public.documents from anon;
revoke all privileges on table public.nda_variables from anon;
revoke all privileges on table public.messages from anon;
revoke all privileges on table public.internal_messages from anon;
revoke all privileges on table public.program_ai_analyses from anon;
revoke all privileges on table public.dossier_program_versions from anon;

revoke truncate, references, trigger on table public.profiles from authenticated;
revoke truncate, references, trigger on table public.dossiers from authenticated;
revoke truncate, references, trigger on table public.dossier_assignments from authenticated;
revoke truncate, references, trigger on table public.formations from authenticated;
revoke truncate, references, trigger on table public.documents from authenticated;
revoke truncate, references, trigger on table public.nda_variables from authenticated;
revoke truncate, references, trigger on table public.messages from authenticated;
revoke truncate, references, trigger on table public.internal_messages from authenticated;
revoke truncate, references, trigger on table public.program_ai_analyses from authenticated;
revoke truncate, references, trigger on table public.dossier_program_versions from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Replace only policies owned by this hardening lot.
-- ---------------------------------------------------------------------------

-- profiles
 drop policy if exists legacy_profiles_self_or_staff_select on public.profiles;
 drop policy if exists legacy_profiles_staff_write on public.profiles;

create policy legacy_profiles_self_or_staff_select
on public.profiles
for select
to authenticated
using (
  public.daily_is_selen_staff()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create policy legacy_profiles_staff_write
on public.profiles
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

-- dossiers
 drop policy if exists legacy_dossiers_member_or_staff_select on public.dossiers;
 drop policy if exists legacy_dossiers_staff_write on public.dossiers;

create policy legacy_dossiers_member_or_staff_select
on public.dossiers
for select
to authenticated
using (public.can_access_organisation(organisation_id));

create policy legacy_dossiers_staff_write
on public.dossiers
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

-- dossier_assignments: staff only
 drop policy if exists legacy_dossier_assignments_staff_all on public.dossier_assignments;

create policy legacy_dossier_assignments_staff_all
on public.dossier_assignments
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

-- formations
 drop policy if exists legacy_formations_member_or_staff_select on public.formations;
 drop policy if exists legacy_formations_staff_write on public.formations;

create policy legacy_formations_member_or_staff_select
on public.formations
for select
to authenticated
using (public.can_access_organisation(organisation_id));

create policy legacy_formations_staff_write
on public.formations
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

-- documents: members may read only client-visible documents in their org.
 drop policy if exists legacy_documents_client_visible_or_staff_select on public.documents;
 drop policy if exists legacy_documents_staff_write on public.documents;

create policy legacy_documents_client_visible_or_staff_select
on public.documents
for select
to authenticated
using (
  public.daily_is_selen_staff()
  or (
    is_visible_to_client is true
    and organisation_id is not null
    and public.has_active_organisation_membership(organisation_id)
  )
);

create policy legacy_documents_staff_write
on public.documents
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

-- nda_variables: membership-scoped read only for clients; staff writes.
 drop policy if exists legacy_nda_variables_member_or_staff_select on public.nda_variables;
 drop policy if exists legacy_nda_variables_staff_write on public.nda_variables;

create policy legacy_nda_variables_member_or_staff_select
on public.nda_variables
for select
to authenticated
using (public.can_access_organisation(organisation_id));

create policy legacy_nda_variables_staff_write
on public.nda_variables
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

-- messages: client read is scoped through the linked dossier organisation.
-- Direct client writes are intentionally not allowed; the inspected NDA route
-- performs controlled server-side writes with service_role.
 drop policy if exists legacy_messages_member_or_staff_select on public.messages;
 drop policy if exists legacy_messages_staff_write on public.messages;

create policy legacy_messages_member_or_staff_select
on public.messages
for select
to authenticated
using (
  public.daily_is_selen_staff()
  or exists (
    select 1
    from public.dossiers d
    where d.id = messages.dossier_id
      and public.has_active_organisation_membership(d.organisation_id)
  )
);

create policy legacy_messages_staff_write
on public.messages
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

-- internal_messages: staff only.
 drop policy if exists legacy_internal_messages_staff_all on public.internal_messages;

create policy legacy_internal_messages_staff_all
on public.internal_messages
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

-- program_ai_analyses: staff / server only.
 drop policy if exists legacy_program_ai_analyses_staff_all on public.program_ai_analyses;

create policy legacy_program_ai_analyses_staff_all
on public.program_ai_analyses
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

-- dossier_program_versions: clients can read versions tied to dossiers in an
-- active organisation membership; all direct writes remain staff-only.
 drop policy if exists legacy_program_versions_member_or_staff_select on public.dossier_program_versions;
 drop policy if exists legacy_program_versions_staff_write on public.dossier_program_versions;

create policy legacy_program_versions_member_or_staff_select
on public.dossier_program_versions
for select
to authenticated
using (
  public.daily_is_selen_staff()
  or exists (
    select 1
    from public.dossiers d
    where d.id = dossier_program_versions.dossier_id
      and public.has_active_organisation_membership(d.organisation_id)
  )
);

create policy legacy_program_versions_staff_write
on public.dossier_program_versions
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

-- ---------------------------------------------------------------------------
-- Promotion gate before this draft becomes a migration:
--   1. Execute this script inside BEGIN / ROLLBACK and verify all policies.
--   2. Confirm anon has zero privileges on all ten tables.
--   3. Confirm authenticated has no TRUNCATE / REFERENCES / TRIGGER.
--   4. Confirm staff still has intended access through RLS.
--   5. Confirm an organisation member cannot access another organisation.
--   6. Confirm inspected NDA client routes still work through service_role.
--   7. Run Supabase security advisors after the real migration.
-- ---------------------------------------------------------------------------
