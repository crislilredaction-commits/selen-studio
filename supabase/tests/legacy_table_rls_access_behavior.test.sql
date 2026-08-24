-- Behavioural promotion guard for the ten historical public tables.
--
-- Run only on a controlled database where the candidate legacy RLS hardening
-- migration has already been applied. This suite does not create business rows
-- and leaves no durable session state because it runs inside a transaction.

begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

-- Preserve baseline row counts while still running as the privileged test role.
create temporary table legacy_rls_expected_counts(table_name text primary key, row_count bigint) on commit drop;
insert into legacy_rls_expected_counts(table_name, row_count) values
  ('profiles', (select count(*) from public.profiles)),
  ('dossiers', (select count(*) from public.dossiers)),
  ('dossier_assignments', (select count(*) from public.dossier_assignments)),
  ('formations', (select count(*) from public.formations)),
  ('documents', (select count(*) from public.documents)),
  ('nda_variables', (select count(*) from public.nda_variables)),
  ('messages', (select count(*) from public.messages)),
  ('internal_messages', (select count(*) from public.internal_messages)),
  ('program_ai_analyses', (select count(*) from public.program_ai_analyses)),
  ('dossier_program_versions', (select count(*) from public.dossier_program_versions));
grant select on legacy_rls_expected_counts to authenticated;

-- 1-10: an authenticated user who is not Selen staff must not see any direct
-- business-table rows. profiles is checked separately because self-read is an
-- intentional compatibility exception.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-000000000001',
    'email', 'legacy-rls-nonstaff@example.invalid',
    'role', 'authenticated'
  )::text,
  true
);

select is((select count(*)::bigint from public.dossiers), 0::bigint, 'non-staff cannot read dossiers directly');
select is((select count(*)::bigint from public.dossier_assignments), 0::bigint, 'non-staff cannot read dossier_assignments directly');
select is((select count(*)::bigint from public.formations), 0::bigint, 'non-staff cannot read formations directly');
select is((select count(*)::bigint from public.documents), 0::bigint, 'non-staff cannot read documents directly');
select is((select count(*)::bigint from public.nda_variables), 0::bigint, 'non-staff cannot read nda_variables directly');
select is((select count(*)::bigint from public.messages), 0::bigint, 'non-staff cannot read messages directly');
select is((select count(*)::bigint from public.internal_messages), 0::bigint, 'non-staff cannot read internal_messages directly');
select is((select count(*)::bigint from public.program_ai_analyses), 0::bigint, 'non-staff cannot read program_ai_analyses directly');
select is((select count(*)::bigint from public.dossier_program_versions), 0::bigint, 'non-staff cannot read dossier_program_versions directly');
select is((select count(*)::bigint from public.profiles), 0::bigint, 'unmatched non-staff cannot read profiles');

-- Reset to the privileged test role to resolve one real active staff identity
-- without hard-coding or exposing it in the test file.
reset role;
select set_config('request.jwt.claims', '{}', true);

create temporary table legacy_rls_test_staff(user_id uuid, email text) on commit drop;
insert into legacy_rls_test_staff(user_id, email)
select ap.user_id, ap.email
from public.agent_profiles ap
where ap.is_active = true
  and ap.role in ('agent', 'admin')
  and (ap.user_id is not null or ap.email is not null)
order by case when ap.user_id is not null then 0 else 1 end, ap.created_at
limit 1;
grant select on legacy_rls_test_staff to authenticated;

select ok((select count(*) = 1 from legacy_rls_test_staff), 'an active staff identity is available for RLS verification');
select set_config(
  'request.jwt.claims',
  (
    select json_build_object(
      'sub', coalesce(user_id::text, '00000000-0000-0000-0000-000000000002'),
      'email', coalesce(email, 'legacy-rls-staff@example.invalid'),
      'role', 'authenticated'
    )::text
    from legacy_rls_test_staff
    limit 1
  ),
  true
);
set local role authenticated;

select ok(public.daily_is_selen_staff(), 'active staff claims are recognised by daily_is_selen_staff');
select is((select count(*)::bigint from public.dossiers), (select row_count from legacy_rls_expected_counts where table_name = 'dossiers'), 'staff retains direct read access to dossiers');
select is((select count(*)::bigint from public.dossier_assignments), (select row_count from legacy_rls_expected_counts where table_name = 'dossier_assignments'), 'staff retains direct read access to dossier_assignments');
select is((select count(*)::bigint from public.formations), (select row_count from legacy_rls_expected_counts where table_name = 'formations'), 'staff retains direct read access to formations');
select is((select count(*)::bigint from public.documents), (select row_count from legacy_rls_expected_counts where table_name = 'documents'), 'staff retains direct read access to documents');
select is((select count(*)::bigint from public.nda_variables), (select row_count from legacy_rls_expected_counts where table_name = 'nda_variables'), 'staff retains direct read access to nda_variables');
select is((select count(*)::bigint from public.messages), (select row_count from legacy_rls_expected_counts where table_name = 'messages'), 'staff retains direct read access to messages');
select is((select count(*)::bigint from public.internal_messages), (select row_count from legacy_rls_expected_counts where table_name = 'internal_messages'), 'staff retains direct read access to internal_messages');
select is((select count(*)::bigint from public.program_ai_analyses), (select row_count from legacy_rls_expected_counts where table_name = 'program_ai_analyses'), 'staff retains direct read access to program_ai_analyses');
select is((select count(*)::bigint from public.dossier_program_versions), (select row_count from legacy_rls_expected_counts where table_name = 'dossier_program_versions'), 'staff retains direct read access to dossier_program_versions');
select is((select count(*)::bigint from public.profiles), (select row_count from legacy_rls_expected_counts where table_name = 'profiles'), 'staff retains direct read access to profiles');

reset role;
select * from finish();
rollback;
