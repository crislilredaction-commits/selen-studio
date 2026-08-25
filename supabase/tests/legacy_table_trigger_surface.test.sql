-- Read-only regression guard for user triggers attached to the ten historical tables.
--
-- This suite captures the trigger surface reviewed on 2026-08-25 before the
-- legacy-table RLS candidate is promoted. It intentionally fails if a new
-- trigger, event, privileged trigger function, or unreviewed trigger function
-- appears on the perimeter.
--
-- No business data is written. pgtap is created transactionally when absent
-- and the transaction is rolled back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

-- 1: the reviewed perimeter currently contains exactly five user triggers.
select is(
  (
    select count(*)::integer
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and n.nspname = 'public'
      and c.relname = any(array[
        'profiles',
        'dossiers',
        'dossier_assignments',
        'formations',
        'documents',
        'nda_variables',
        'messages',
        'internal_messages',
        'program_ai_analyses',
        'dossier_program_versions'
      ])
  ),
  5,
  'exactly five user triggers exist on the legacy-table perimeter'
);

-- 2-3: every reviewed trigger is a BEFORE UPDATE trigger and no other write
-- event is attached to the legacy perimeter.
select is(
  (
    select count(*)::integer
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and n.nspname = 'public'
      and c.relname = any(array[
        'profiles',
        'dossiers',
        'dossier_assignments',
        'formations',
        'documents',
        'nda_variables',
        'messages',
        'internal_messages',
        'program_ai_analyses',
        'dossier_program_versions'
      ])
      and pg_get_triggerdef(t.oid, true) not like '%BEFORE UPDATE%'
  ),
  0,
  'all legacy-table user triggers are BEFORE UPDATE'
);

select is(
  (
    select count(*)::integer
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and n.nspname = 'public'
      and c.relname = any(array[
        'profiles',
        'dossiers',
        'dossier_assignments',
        'formations',
        'documents',
        'nda_variables',
        'messages',
        'internal_messages',
        'program_ai_analyses',
        'dossier_program_versions'
      ])
      and (
        pg_get_triggerdef(t.oid, true) like '% INSERT %'
        or pg_get_triggerdef(t.oid, true) like '% DELETE %'
        or pg_get_triggerdef(t.oid, true) like '% TRUNCATE %'
      )
  ),
  0,
  'no INSERT DELETE or TRUNCATE trigger exists on the legacy-table perimeter'
);

-- 4-5: trigger functions must remain the two reviewed timestamp helpers and
-- must not be SECURITY DEFINER.
select is(
  (
    select count(*)::integer
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal
      and n.nspname = 'public'
      and c.relname = any(array[
        'profiles',
        'dossiers',
        'dossier_assignments',
        'formations',
        'documents',
        'nda_variables',
        'messages',
        'internal_messages',
        'program_ai_analyses',
        'dossier_program_versions'
      ])
      and p.prosecdef
  ),
  0,
  'legacy-table trigger functions are not SECURITY DEFINER'
);

select is(
  (
    select count(*)::integer
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal
      and n.nspname = 'public'
      and c.relname = any(array[
        'profiles',
        'dossiers',
        'dossier_assignments',
        'formations',
        'documents',
        'nda_variables',
        'messages',
        'internal_messages',
        'program_ai_analyses',
        'dossier_program_versions'
      ])
      and p.proname not in ('update_updated_at_column', 'set_updated_at')
  ),
  0,
  'legacy-table triggers only use reviewed timestamp functions'
);

-- 6-8: pin the reviewed five-trigger topology so an accidental removal or
-- replacement is visible during promotion checks.
select is(
  (
    select count(*)::integer
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and n.nspname = 'public'
      and c.relname = 'documents'
      and t.tgname = 'set_updated_at_on_documents'
  ),
  1,
  'documents timestamp trigger exists once'
);

select is(
  (
    select count(*)::integer
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and n.nspname = 'public'
      and c.relname = 'dossier_program_versions'
      and t.tgname = 'trg_dossier_program_versions_updated_at'
  ),
  1,
  'dossier_program_versions timestamp trigger exists once'
);

select is(
  (
    select count(*)::integer
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and n.nspname = 'public'
      and (
        (c.relname = 'dossiers' and t.tgname = 'set_updated_at_on_dossiers')
        or (c.relname = 'formations' and t.tgname = 'set_updated_at_on_formations')
        or (
          c.relname = 'program_ai_analyses'
          and t.tgname = 'trg_program_ai_analyses_updated_at'
        )
      )
  ),
  3,
  'the other three reviewed timestamp triggers remain present'
);

select * from finish();
rollback;
