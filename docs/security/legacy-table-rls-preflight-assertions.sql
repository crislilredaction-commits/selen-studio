-- Selen Studio — assertions lecture seule avant durcissement RLS historique
-- Date : 2026-08-23
-- IMPORTANT : aucun DDL/DML. Ce script ne modifie ni données ni objets.
-- Objectif : détecter une dérive de l'état réel avant de transformer le brouillon RLS en migration.

with target_tables(table_name) as (
  values
    ('profiles'),
    ('dossiers'),
    ('dossier_assignments'),
    ('formations'),
    ('documents'),
    ('nda_variables'),
    ('messages'),
    ('internal_messages'),
    ('program_ai_analyses'),
    ('dossier_program_versions')
), table_state as (
  select
    t.table_name,
    c.oid is not null as exists_in_public,
    coalesce(c.relrowsecurity, false) as rls_enabled
  from target_tables t
  left join pg_namespace n on n.nspname = 'public'
  left join pg_class c
    on c.relnamespace = n.oid
   and c.relname = t.table_name
   and c.relkind in ('r', 'p')
), public_grants as (
  select distinct grantee, table_name, privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in (select table_name from target_tables)
    and grantee in ('anon', 'authenticated')
), installed_policies as (
  select tablename, policyname
  from pg_policies
  where schemaname = 'public'
    and tablename in (select table_name from target_tables)
), staff_guard as (
  select count(*)::integer as guard_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'daily_is_selen_staff'
)
select * from (
  select
    'target_tables_exist'::text as assertion,
    10::bigint as expected,
    count(*) filter (where exists_in_public)::bigint as actual,
    count(*) filter (where exists_in_public) = 10 as ok
  from table_state

  union all

  select
    'target_tables_with_rls_enabled',
    0,
    count(*) filter (where rls_enabled),
    count(*) filter (where rls_enabled) = 0
  from table_state

  union all

  select
    'target_tables_with_anon_privileges',
    10,
    count(distinct table_name) filter (where grantee = 'anon'),
    count(distinct table_name) filter (where grantee = 'anon') = 10
  from public_grants

  union all

  select
    'target_tables_with_authenticated_privileges',
    10,
    count(distinct table_name) filter (where grantee = 'authenticated'),
    count(distinct table_name) filter (where grantee = 'authenticated') = 10
  from public_grants

  union all

  select
    'installed_rls_policies_on_targets',
    0,
    count(*)::bigint,
    count(*) = 0
  from installed_policies

  union all

  select
    'daily_is_selen_staff_function_count',
    1,
    guard_count::bigint,
    guard_count = 1
  from staff_guard
) assertions
order by assertion;

-- Détail des privilèges dangereux qui devront disparaître du rôle authenticated.
select
  table_name,
  string_agg(privilege_type, ', ' order by privilege_type) as dangerous_privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'authenticated'
  and table_name in (
    'profiles', 'dossiers', 'dossier_assignments', 'formations', 'documents',
    'nda_variables', 'messages', 'internal_messages', 'program_ai_analyses',
    'dossier_program_versions'
  )
  and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
group by table_name
order by table_name;
