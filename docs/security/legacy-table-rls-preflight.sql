-- Selen Studio — préflight lecture seule avant durcissement RLS des tables historiques
-- Date : 2026-08-23
-- IMPORTANT : ce script ne modifie aucune donnée ni aucun objet.
-- Il sert à vérifier que l'état réel correspond toujours aux hypothèses du lot sécurité
-- avant toute application future de la migration RLS.

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
)
select
  t.table_name,
  c.oid is not null as exists_in_public,
  coalesce(c.relrowsecurity, false) as rls_enabled,
  coalesce(c.relforcerowsecurity, false) as force_rls
from target_tables t
left join pg_namespace n on n.nspname = 'public'
left join pg_class c
  on c.relnamespace = n.oid
 and c.relname = t.table_name
 and c.relkind in ('r', 'p')
order by t.table_name;

-- Privilèges Data API actuellement exposés aux rôles publics.
select
  grantee,
  table_name,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
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
  )
  and grantee in ('anon', 'authenticated', 'service_role')
group by grantee, table_name
order by table_name, grantee;

-- Policies actuellement installées sur les tables ciblées.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
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
  )
order by tablename, policyname;

-- Vérification du garde staff réutilisé par le projet.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  p.proacl as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'daily_is_selen_staff';

-- Volumétrie uniquement, sans restitution de données personnelles.
select 'profiles' as table_name, count(*)::bigint as row_count from public.profiles
union all select 'dossiers', count(*) from public.dossiers
union all select 'dossier_assignments', count(*) from public.dossier_assignments
union all select 'formations', count(*) from public.formations
union all select 'documents', count(*) from public.documents
union all select 'nda_variables', count(*) from public.nda_variables
union all select 'messages', count(*) from public.messages
union all select 'internal_messages', count(*) from public.internal_messages
union all select 'program_ai_analyses', count(*) from public.program_ai_analyses
union all select 'dossier_program_versions', count(*) from public.dossier_program_versions
order by table_name;

-- Clés étrangères touchant les tables ciblées : utile pour repérer une dépendance oubliée.
select
  con.conname as constraint_name,
  src.relname as source_table,
  tgt.relname as target_table,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class src on src.oid = con.conrelid
join pg_namespace src_ns on src_ns.oid = src.relnamespace
join pg_class tgt on tgt.oid = con.confrelid
join pg_namespace tgt_ns on tgt_ns.oid = tgt.relnamespace
where con.contype = 'f'
  and src_ns.nspname = 'public'
  and tgt_ns.nspname = 'public'
  and (
    src.relname in (
      'profiles', 'dossiers', 'dossier_assignments', 'formations', 'documents',
      'nda_variables', 'messages', 'internal_messages', 'program_ai_analyses',
      'dossier_program_versions'
    )
    or tgt.relname in (
      'profiles', 'dossiers', 'dossier_assignments', 'formations', 'documents',
      'nda_variables', 'messages', 'internal_messages', 'program_ai_analyses',
      'dossier_program_versions'
    )
  )
order by source_table, constraint_name;

-- Triggers non internes sur les tables ciblées.
select
  c.relname as table_name,
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
  and c.relname in (
    'profiles', 'dossiers', 'dossier_assignments', 'formations', 'documents',
    'nda_variables', 'messages', 'internal_messages', 'program_ai_analyses',
    'dossier_program_versions'
  )
order by c.relname, t.tgname;
