-- Write-behaviour promotion guard for the historical public tables that
-- currently contain rows.
--
-- Run only on a controlled database where the candidate legacy RLS hardening
-- migration has already been applied. Every UPDATE below is a no-op on the
-- primary key and the whole suite rolls back, so no durable business-data
-- change remains. Tables that are currently empty stay covered by the policy /
-- privilege promotion tests and the read-behaviour suite.

begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

create temporary table legacy_rls_write_expected_counts(
  table_name text primary key,
  row_count bigint
) on commit drop;

insert into legacy_rls_write_expected_counts(table_name, row_count) values
  ('dossiers', (select count(*) from public.dossiers)),
  ('dossier_assignments', (select count(*) from public.dossier_assignments)),
  ('documents', (select count(*) from public.documents)),
  ('nda_variables', (select count(*) from public.nda_variables)),
  ('messages', (select count(*) from public.messages)),
  ('internal_messages', (select count(*) from public.internal_messages)),
  ('program_ai_analyses', (select count(*) from public.program_ai_analyses)),
  ('dossier_program_versions', (select count(*) from public.dossier_program_versions));

grant select on legacy_rls_write_expected_counts to authenticated;

-- 1-8: a regular authenticated non-staff user must not be able to update any
-- row directly. RLS returns zero affected rows rather than raising an error.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-000000000001',
    'email', 'legacy-write-nonstaff@example.invalid',
    'role', 'authenticated'
  )::text,
  true
);

select is((with u as (update public.dossiers set id = id returning 1) select count(*)::bigint from u), 0::bigint, 'non-staff cannot update dossiers directly');
select is((with u as (update public.dossier_assignments set id = id returning 1) select count(*)::bigint from u), 0::bigint, 'non-staff cannot update dossier_assignments directly');
select is((with u as (update public.documents set id = id returning 1) select count(*)::bigint from u), 0::bigint, 'non-staff cannot update documents directly');
select is((with u as (update public.nda_variables set id = id returning 1) select count(*)::bigint from u), 0::bigint, 'non-staff cannot update nda_variables directly');
select is((with u as (update public.messages set id = id returning 1) select count(*)::bigint from u), 0::bigint, 'non-staff cannot update messages directly');
select is((with u as (update public.internal_messages set id = id returning 1) select count(*)::bigint from u), 0::bigint, 'non-staff cannot update internal_messages directly');
select is((with u as (update public.program_ai_analyses set id = id returning 1) select count(*)::bigint from u), 0::bigint, 'non-staff cannot update program_ai_analyses directly');
select is((with u as (update public.dossier_program_versions set id = id returning 1) select count(*)::bigint from u), 0::bigint, 'non-staff cannot update dossier_program_versions directly');

reset role;
select set_config('request.jwt.claims', '{}', true);

-- Resolve one active staff identity dynamically so no account identifier is
-- committed to the repository.
create temporary table legacy_rls_write_test_staff(user_id uuid, email text) on commit drop;
insert into legacy_rls_write_test_staff(user_id, email)
select ap.user_id, ap.email
from public.agent_profiles ap
where ap.is_active = true
  and ap.role in ('agent', 'admin')
  and (ap.user_id is not null or ap.email is not null)
order by case when ap.user_id is not null then 0 else 1 end, ap.created_at
limit 1;

grant select on legacy_rls_write_test_staff to authenticated;

select set_config(
  'request.jwt.claims',
  (
    select json_build_object(
      'sub', coalesce(user_id::text, '00000000-0000-0000-0000-000000000002'),
      'email', coalesce(email, 'legacy-write-staff@example.invalid'),
      'role', 'authenticated'
    )::text
    from legacy_rls_write_test_staff
    limit 1
  ),
  true
);
set local role authenticated;

-- 9-16: active staff keeps the direct UPDATE capability required by the
-- historical Studio screens. Because these are id = id updates, the assertion
-- is simply that every currently visible row remains writable under RLS.
select is((with u as (update public.dossiers set id = id returning 1) select count(*)::bigint from u), (select row_count from legacy_rls_write_expected_counts where table_name = 'dossiers'), 'staff retains direct update access to dossiers');
select is((with u as (update public.dossier_assignments set id = id returning 1) select count(*)::bigint from u), (select row_count from legacy_rls_write_expected_counts where table_name = 'dossier_assignments'), 'staff retains direct update access to dossier_assignments');
select is((with u as (update public.documents set id = id returning 1) select count(*)::bigint from u), (select row_count from legacy_rls_write_expected_counts where table_name = 'documents'), 'staff retains direct update access to documents');
select is((with u as (update public.nda_variables set id = id returning 1) select count(*)::bigint from u), (select row_count from legacy_rls_write_expected_counts where table_name = 'nda_variables'), 'staff retains direct update access to nda_variables');
select is((with u as (update public.messages set id = id returning 1) select count(*)::bigint from u), (select row_count from legacy_rls_write_expected_counts where table_name = 'messages'), 'staff retains direct update access to messages');
select is((with u as (update public.internal_messages set id = id returning 1) select count(*)::bigint from u), (select row_count from legacy_rls_write_expected_counts where table_name = 'internal_messages'), 'staff retains direct update access to internal_messages');
select is((with u as (update public.program_ai_analyses set id = id returning 1) select count(*)::bigint from u), (select row_count from legacy_rls_write_expected_counts where table_name = 'program_ai_analyses'), 'staff retains direct update access to program_ai_analyses');
select is((with u as (update public.dossier_program_versions set id = id returning 1) select count(*)::bigint from u), (select row_count from legacy_rls_write_expected_counts where table_name = 'dossier_program_versions'), 'staff retains direct update access to dossier_program_versions');

reset role;
select * from finish();
rollback;
