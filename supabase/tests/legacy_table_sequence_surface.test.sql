-- Read-only regression guard for sequences owned by the ten historical tables.
--
-- The reviewed production state on 2026-08-25 contains no owned sequence or
-- identity sequence for the legacy-table perimeter. This prevents a future
-- sequence-backed write surface from appearing without explicit review of its
-- grants when the RLS hardening candidate is promoted.
--
-- No business data is written. pgtap is created transactionally when absent
-- and the transaction is rolled back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

create temporary table legacy_target_tables(name text primary key) on commit drop;
insert into legacy_target_tables(name) values
  ('profiles'),
  ('dossiers'),
  ('dossier_assignments'),
  ('formations'),
  ('documents'),
  ('nda_variables'),
  ('messages'),
  ('internal_messages'),
  ('program_ai_analyses'),
  ('dossier_program_versions');

-- 1: no sequence is owned by a column of the reviewed perimeter.
select is(
  (
    select count(distinct s.oid)::integer
    from pg_class s
    join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
    join pg_class t on t.oid = d.refobjid
    join pg_namespace nt on nt.oid = t.relnamespace
    join legacy_target_tables target on target.name = t.relname
    where s.relkind = 'S'
      and nt.nspname = 'public'
  ),
  0,
  'no sequence is owned by the legacy-table perimeter'
);

-- 2: no owned sequence can expose USAGE to anon/authenticated because none
-- exists. This assertion also catches a future sequence with a direct grant.
select is(
  (
    select count(*)::integer
    from information_schema.role_usage_grants g
    where g.object_type = 'SEQUENCE'
      and g.grantee in ('anon', 'authenticated')
      and exists (
        select 1
        from pg_class s
        join pg_namespace ns on ns.oid = s.relnamespace
        join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
        join pg_class t on t.oid = d.refobjid
        join pg_namespace nt on nt.oid = t.relnamespace
        join legacy_target_tables target on target.name = t.relname
        where s.relkind = 'S'
          and ns.nspname = g.object_schema
          and s.relname = g.object_name
          and nt.nspname = 'public'
      )
  ),
  0,
  'no legacy-table sequence exposes USAGE to anon or authenticated'
);

-- 3: pin the complete reviewed sequence surface to zero so future identity or
-- serial columns require an explicit security review.
select is(
  (
    select count(*)::integer
    from pg_class s
    join pg_namespace ns on ns.oid = s.relnamespace
    join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
    join pg_class t on t.oid = d.refobjid
    join pg_namespace nt on nt.oid = t.relnamespace
    join legacy_target_tables target on target.name = t.relname
    where s.relkind = 'S'
      and ns.nspname = 'public'
      and nt.nspname = 'public'
  ),
  0,
  'reviewed legacy-table sequence surface remains empty'
);

select * from finish();
rollback;
