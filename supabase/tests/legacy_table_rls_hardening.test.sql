-- Post-migration promotion guard for the ten historical public tables.
--
-- This suite is intentionally expected to fail before the legacy hardening
-- migration is promoted. Run it only on a controlled database where the
-- candidate migration has been applied. The transaction leaves no test data.

begin;

create extension if not exists pgtap with schema extensions;

select plan(34);

-- 1-10: all targeted tables must have RLS enabled.
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'profiles'), 'profiles has RLS enabled');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'dossiers'), 'dossiers has RLS enabled');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'dossier_assignments'), 'dossier_assignments has RLS enabled');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'formations'), 'formations has RLS enabled');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'documents'), 'documents has RLS enabled');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'nda_variables'), 'nda_variables has RLS enabled');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'messages'), 'messages has RLS enabled');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'internal_messages'), 'internal_messages has RLS enabled');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'program_ai_analyses'), 'program_ai_analyses has RLS enabled');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'dossier_program_versions'), 'dossier_program_versions has RLS enabled');

-- 11-20: anon must have no direct privilege at all on the targeted tables.
select ok(not has_table_privilege('anon', 'public.profiles', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'), 'anon has no privileges on profiles');
select ok(not has_table_privilege('anon', 'public.dossiers', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'), 'anon has no privileges on dossiers');
select ok(not has_table_privilege('anon', 'public.dossier_assignments', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'), 'anon has no privileges on dossier_assignments');
select ok(not has_table_privilege('anon', 'public.formations', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'), 'anon has no privileges on formations');
select ok(not has_table_privilege('anon', 'public.documents', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'), 'anon has no privileges on documents');
select ok(not has_table_privilege('anon', 'public.nda_variables', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'), 'anon has no privileges on nda_variables');
select ok(not has_table_privilege('anon', 'public.messages', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'), 'anon has no privileges on messages');
select ok(not has_table_privilege('anon', 'public.internal_messages', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'), 'anon has no privileges on internal_messages');
select ok(not has_table_privilege('anon', 'public.program_ai_analyses', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'), 'anon has no privileges on program_ai_analyses');
select ok(not has_table_privilege('anon', 'public.dossier_program_versions', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'), 'anon has no privileges on dossier_program_versions');

-- 21-30: authenticated must no longer hold dangerous schema-level privileges.
select ok(not has_table_privilege('authenticated', 'public.profiles', 'TRUNCATE, REFERENCES, TRIGGER'), 'authenticated has no dangerous privileges on profiles');
select ok(not has_table_privilege('authenticated', 'public.dossiers', 'TRUNCATE, REFERENCES, TRIGGER'), 'authenticated has no dangerous privileges on dossiers');
select ok(not has_table_privilege('authenticated', 'public.dossier_assignments', 'TRUNCATE, REFERENCES, TRIGGER'), 'authenticated has no dangerous privileges on dossier_assignments');
select ok(not has_table_privilege('authenticated', 'public.formations', 'TRUNCATE, REFERENCES, TRIGGER'), 'authenticated has no dangerous privileges on formations');
select ok(not has_table_privilege('authenticated', 'public.documents', 'TRUNCATE, REFERENCES, TRIGGER'), 'authenticated has no dangerous privileges on documents');
select ok(not has_table_privilege('authenticated', 'public.nda_variables', 'TRUNCATE, REFERENCES, TRIGGER'), 'authenticated has no dangerous privileges on nda_variables');
select ok(not has_table_privilege('authenticated', 'public.messages', 'TRUNCATE, REFERENCES, TRIGGER'), 'authenticated has no dangerous privileges on messages');
select ok(not has_table_privilege('authenticated', 'public.internal_messages', 'TRUNCATE, REFERENCES, TRIGGER'), 'authenticated has no dangerous privileges on internal_messages');
select ok(not has_table_privilege('authenticated', 'public.program_ai_analyses', 'TRUNCATE, REFERENCES, TRIGGER'), 'authenticated has no dangerous privileges on program_ai_analyses');
select ok(not has_table_privilege('authenticated', 'public.dossier_program_versions', 'TRUNCATE, REFERENCES, TRIGGER'), 'authenticated has no dangerous privileges on dossier_program_versions');

-- 31-34: policy topology and staff helper must match the reviewed design.
select has_function('public', 'daily_is_selen_staff', array[]::text[], 'daily_is_selen_staff exists');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and policyname like 'legacy_%'), 11, 'exactly 11 legacy hardening policies exist');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'legacy_profiles_self_select'), 1, 'profiles self-read policy exists once');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and policyname like 'legacy_%_staff_all'), 10, 'ten staff-all policies exist');

select * from finish();
rollback;
