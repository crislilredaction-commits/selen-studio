-- Read-only preflight for the 10 historical public tables.
-- This file is NOT a migration and must not alter production state.

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
    c.relrowsecurity as rls_enabled,
    c.relforcerowsecurity as force_rls,
    coalesce(s.n_live_tup, 0) as approx_rows
  from target_tables t
  join pg_class c on c.relname = t.table_name
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  left join pg_stat_user_tables s on s.relid = c.oid
), grants as (
  select
    table_name,
    grantee,
    array_agg(privilege_type order by privilege_type) as privileges
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in (select table_name from target_tables)
    and grantee in ('anon', 'authenticated')
  group by table_name, grantee
), policies as (
  select
    tablename as table_name,
    count(*) as policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename in (select table_name from target_tables)
  group by tablename
)
select
  s.table_name,
  s.rls_enabled,
  s.force_rls,
  s.approx_rows,
  coalesce(p.policy_count, 0) as policy_count,
  coalesce(a.privileges, array[]::text[]) as anon_privileges,
  coalesce(u.privileges, array[]::text[]) as authenticated_privileges
from table_state s
left join policies p on p.table_name = s.table_name
left join grants a on a.table_name = s.table_name and a.grantee = 'anon'
left join grants u on u.table_name = s.table_name and u.grantee = 'authenticated'
order by s.table_name;

-- Scope quality checks. These return counts only and do not expose row contents.
select
  (select count(*) from public.documents where dossier_id is null and organisation_id is null) as documents_without_scope,
  (select count(*) from public.nda_variables where dossier_id is null and organisation_id is null) as nda_variables_without_scope,
  (select count(*) from public.internal_messages where dossier_id is null) as internal_messages_without_dossier,
  (select count(*) from public.messages m left join public.dossiers d on d.id = m.dossier_id where d.id is null) as orphan_messages,
  (select count(*) from public.program_ai_analyses a left join public.dossiers d on d.id = a.dossier_id where d.id is null) as orphan_program_ai_analyses,
  (select count(*) from public.dossier_program_versions v left join public.dossiers d on d.id = v.dossier_id where d.id is null) as orphan_program_versions,
  (select count(*) from public.dossier_assignments a left join public.dossiers d on d.id = a.dossier_id where d.id is null) as orphan_assignments;
