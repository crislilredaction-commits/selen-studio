-- DRAFT ONLY — DO NOT APPLY AS A MIGRATION YET.
--
-- Purpose: harden the ten legacy public tables identified by the August 2026
-- access audit while preserving the inspected NDA server-side flows.
--
-- This script is intentionally stored under docs/security rather than
-- supabase/migrations. It must pass transactional rollback and regression tests
-- before being promoted to a real migration.
--
-- Verified access model:
--   * the NDA client page uses the browser Supabase client for Auth only;
--   * NDA dossier state, uploads, downloads, messages, program versions and
--     updates pass through server routes;
--   * those routes resolve the signed-in user, explicitly verify dossier /
--     organisation ownership, then use service_role for database access;
--   * service_role bypasses RLS, so controlled client routes remain functional;
--   * direct authenticated access to these historical business tables is not a
--     client contract and can therefore be staff-only;
--   * profiles keeps self-read for compatibility, but direct writes stay staff;
--   * anon receives no direct access to any of the ten historical tables.

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
--
-- Normal authenticated DML grants are kept temporarily for Studio compatibility.
-- RLS below makes all business-table operations staff-only. A later privilege
-- minimisation pass may revoke unused SELECT / INSERT / UPDATE / DELETE grants
-- after the Studio regression suite proves which grants are no longer needed.
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

-- profiles: preserve a minimal self-read compatibility path; staff may manage.
drop policy if exists legacy_profiles_self_select on public.profiles;
drop policy if exists legacy_profiles_staff_all on public.profiles;

create policy legacy_profiles_self_select
on public.profiles
for select
to authenticated
using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy legacy_profiles_staff_all
on public.profiles
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

-- All remaining legacy business tables are direct-access staff only.
-- Client-facing NDA operations continue through verified server routes.

drop policy if exists legacy_dossiers_staff_all on public.dossiers;
create policy legacy_dossiers_staff_all
on public.dossiers
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists legacy_dossier_assignments_staff_all on public.dossier_assignments;
create policy legacy_dossier_assignments_staff_all
on public.dossier_assignments
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists legacy_formations_staff_all on public.formations;
create policy legacy_formations_staff_all
on public.formations
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists legacy_documents_staff_all on public.documents;
create policy legacy_documents_staff_all
on public.documents
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists legacy_nda_variables_staff_all on public.nda_variables;
create policy legacy_nda_variables_staff_all
on public.nda_variables
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists legacy_messages_staff_all on public.messages;
create policy legacy_messages_staff_all
on public.messages
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists legacy_internal_messages_staff_all on public.internal_messages;
create policy legacy_internal_messages_staff_all
on public.internal_messages
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists legacy_program_ai_analyses_staff_all on public.program_ai_analyses;
create policy legacy_program_ai_analyses_staff_all
on public.program_ai_analyses
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists legacy_program_versions_staff_all on public.dossier_program_versions;
create policy legacy_program_versions_staff_all
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
--   4. Simulate authenticated non-staff and confirm legacy business rows are
--      invisible / non-writable directly.
--   5. Simulate active staff and confirm intended direct Studio access.
--   6. Run NDA route non-regression checks with service_role-backed APIs.
--   7. Inspect remaining Studio direct-table calls before grant minimisation.
--   8. Only then promote this file to supabase/migrations and run advisors.
-- ---------------------------------------------------------------------------
