-- PROPOSAL ONLY — DO NOT APPLY AS A MIGRATION YET.
--
-- Purpose: harden the 10 historical public tables after compatibility tests.
-- This proposal intentionally keeps authenticated DML privileges so existing
-- Studio staff flows can continue to use the authenticated Supabase client,
-- while RLS restricts those operations to active Selen staff.
-- Client NDA web flows currently inspected use the server service-role client
-- after explicit dossier/organisation authorization and therefore do not need
-- direct anon/authenticated access to these historical tables.
--
-- Before production application:
--   1. complete code-path mapping;
--   2. run NDA + Studio regression tests;
--   3. apply in a transaction / controlled migration;
--   4. rerun security advisors.

begin;

-- Remove privileges that should never be needed by browser roles.
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

-- Authenticated Studio staff still need ordinary DML. Remove elevated table
-- capabilities inherited from the historical broad grants, then grant only DML.
revoke all privileges on table public.profiles from authenticated;
revoke all privileges on table public.dossiers from authenticated;
revoke all privileges on table public.dossier_assignments from authenticated;
revoke all privileges on table public.formations from authenticated;
revoke all privileges on table public.documents from authenticated;
revoke all privileges on table public.nda_variables from authenticated;
revoke all privileges on table public.messages from authenticated;
revoke all privileges on table public.internal_messages from authenticated;
revoke all privileges on table public.program_ai_analyses from authenticated;
revoke all privileges on table public.dossier_program_versions from authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.dossiers to authenticated;
grant select, insert, update, delete on table public.dossier_assignments to authenticated;
grant select, insert, update, delete on table public.formations to authenticated;
grant select, insert, update, delete on table public.documents to authenticated;
grant select, insert, update, delete on table public.nda_variables to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;
grant select, insert, update, delete on table public.internal_messages to authenticated;
grant select, insert, update, delete on table public.program_ai_analyses to authenticated;
grant select, insert, update, delete on table public.dossier_program_versions to authenticated;

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

-- Policies are intentionally explicit per table even though the predicate is
-- currently identical. This keeps future least-privilege refinements local.
drop policy if exists "Selen staff manage legacy profiles" on public.profiles;
create policy "Selen staff manage legacy profiles"
on public.profiles for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists "Selen staff manage legacy dossiers" on public.dossiers;
create policy "Selen staff manage legacy dossiers"
on public.dossiers for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists "Selen staff manage legacy dossier assignments" on public.dossier_assignments;
create policy "Selen staff manage legacy dossier assignments"
on public.dossier_assignments for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists "Selen staff manage legacy formations" on public.formations;
create policy "Selen staff manage legacy formations"
on public.formations for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists "Selen staff manage legacy documents" on public.documents;
create policy "Selen staff manage legacy documents"
on public.documents for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists "Selen staff manage legacy NDA variables" on public.nda_variables;
create policy "Selen staff manage legacy NDA variables"
on public.nda_variables for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists "Selen staff manage legacy messages" on public.messages;
create policy "Selen staff manage legacy messages"
on public.messages for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists "Selen staff manage legacy internal messages" on public.internal_messages;
create policy "Selen staff manage legacy internal messages"
on public.internal_messages for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists "Selen staff manage legacy program AI analyses" on public.program_ai_analyses;
create policy "Selen staff manage legacy program AI analyses"
on public.program_ai_analyses for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists "Selen staff manage legacy dossier program versions" on public.dossier_program_versions;
create policy "Selen staff manage legacy dossier program versions"
on public.dossier_program_versions for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

-- This proposal file must never be executed casually. The rollback keeps it
-- safe if someone runs it manually during audit/review.
rollback;
