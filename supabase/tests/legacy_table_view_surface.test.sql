-- Read-only regression guard for views depending on the ten historical tables.
--
-- Supabase views can bypass table RLS unless they are deliberately configured
-- and reviewed. The reviewed production state on 2026-08-25 contains no
-- public view or materialized view depending directly on the legacy-table
-- perimeter. This suite makes any future addition explicit before the RLS
-- hardening candidate is promoted.
--
-- No business data is written. pgtap is created transactionally when absent
-- and the transaction is rolled back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

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

-- 1: no public ordinary view directly depends on the reviewed perimeter.
select is(
  (
    select count(distinct vc.oid)::integer
    from pg_rewrite r
    join pg_class vc on vc.oid = r.ev_class
    join pg_namespace vn on vn.oid = vc.relnamespace
    join pg_depend d on d.objid = r.oid
    join pg_class tc on tc.oid = d.refobjid
    join pg_namespace tn on tn.oid = tc.relnamespace
    join legacy_target_tables target on target.name = tc.relname
    where vn.nspname = 'public'
      and tn.nspname = 'public'
      and vc.relkind = 'v'
  ),
  0,
  'no public view directly depends on the legacy-table perimeter'
);

-- 2: no public materialized view directly depends on the reviewed perimeter.
select is(
  (
    select count(distinct vc.oid)::integer
    from pg_rewrite r
    join pg_class vc on vc.oid = r.ev_class
    join pg_namespace vn on vn.oid = vc.relnamespace
    join pg_depend d on d.objid = r.oid
    join pg_class tc on tc.oid = d.refobjid
    join pg_namespace tn on tn.oid = tc.relnamespace
    join legacy_target_tables target on target.name = tc.relname
    where vn.nspname = 'public'
      and tn.nspname = 'public'
      and vc.relkind = 'm'
  ),
  0,
  'no public materialized view directly depends on the legacy-table perimeter'
);

-- 3: consequently no dependent view may currently expose direct Data API
-- privileges to anon or authenticated.
select is(
  (
    select count(*)::integer
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and g.grantee in ('anon', 'authenticated')
      and exists (
        select 1
        from pg_class vc
        join pg_namespace vn on vn.oid = vc.relnamespace
        join pg_rewrite r on r.ev_class = vc.oid
        join pg_depend d on d.objid = r.oid
        join pg_class tc on tc.oid = d.refobjid
        join pg_namespace tn on tn.oid = tc.relnamespace
        join legacy_target_tables target on target.name = tc.relname
        where vn.nspname = g.table_schema
          and vc.relname = g.table_name
          and vc.relkind in ('v', 'm')
          and tn.nspname = 'public'
      )
  ),
  0,
  'no dependent view exposes anon or authenticated grants'
);

-- 4: pin the complete reviewed surface to zero dependent relations so any
-- future view must be explicitly audited for security_invoker and grants.
select is(
  (
    select count(distinct vc.oid)::integer
    from pg_rewrite r
    join pg_class vc on vc.oid = r.ev_class
    join pg_namespace vn on vn.oid = vc.relnamespace
    join pg_depend d on d.objid = r.oid
    join pg_class tc on tc.oid = d.refobjid
    join pg_namespace tn on tn.oid = tc.relnamespace
    join legacy_target_tables target on target.name = tc.relname
    where vn.nspname = 'public'
      and tn.nspname = 'public'
      and vc.relkind in ('v', 'm')
  ),
  0,
  'reviewed legacy-table view surface remains empty'
);

select * from finish();
rollback;
