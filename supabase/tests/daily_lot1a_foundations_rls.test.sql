-- Selen Daily Lot 1A foundation tests.
-- Intended for a controlled database after the local migrations are applied.
-- This file is transactional and must leave no persistent test data.

begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

insert into public.organisations (id, name)
values ('00000000-0000-4000-8000-000000001a01', 'Daily Lot 1A Test Organisation');

select has_table('public', 'organisation_memberships', 'organisation_memberships exists');
select has_table('public', 'organisation_membership_roles', 'organisation_membership_roles exists');
select has_table('public', 'organisation_membership_permission_blocks', 'organisation_membership_permission_blocks exists');
select has_table('public', 'daily_audit_logs', 'daily_audit_logs exists');
select has_table('public', 'daily_documents', 'daily_documents exists');

select has_function('public', 'daily_is_selen_staff', array[]::name[], 'daily_is_selen_staff exists');
select has_function('public', 'has_active_organisation_membership', array['uuid']::name[], 'has_active_organisation_membership exists');
select has_function('public', 'has_organisation_role', array['uuid', 'text']::name[], 'has_organisation_role exists');
select has_function('public', 'has_organisation_permission_block', array['uuid', 'text']::name[], 'has_organisation_permission_block exists');
select has_function('public', 'can_manage_daily_documents', array['uuid']::name[], 'can_manage_daily_documents exists');

select isnt_empty(
  $$select 1 from pg_class where relname = 'organisations' and relrowsecurity = true$$,
  'organisations RLS is enabled'
);

select isnt_empty(
  $$select 1 from pg_class where relname = 'organisation_memberships' and relrowsecurity = true$$,
  'organisation_memberships RLS is enabled'
);

select isnt_empty(
  $$select 1 from pg_class where relname = 'daily_documents' and relrowsecurity = true$$,
  'daily_documents RLS is enabled'
);

select is_empty(
  $$
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'organisations',
        'organisation_memberships',
        'organisation_membership_roles',
        'organisation_membership_permission_blocks',
        'daily_audit_logs',
        'daily_documents'
      )
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
  $$,
  'anon/authenticated do not have TRUNCATE, REFERENCES or TRIGGER on foundation tables'
);

select throws_ok(
  $$
    insert into public.organisation_memberships (
      organisation_id,
      user_id,
      status,
      disabled_at,
      disable_reason
    )
    values (
      gen_random_uuid(),
      gen_random_uuid(),
      'disabled',
      null,
      null
    )
  $$,
  null,
  'disabled membership without disabled_at is rejected'
);

select throws_ok(
  $$
    insert into public.organisation_memberships (
      organisation_id,
      user_id,
      status,
      primary_role
    )
    values (
      gen_random_uuid(),
      gen_random_uuid(),
      'active',
      'owner'
    )
  $$,
  null,
  'invalid primary role is rejected'
);

select throws_ok(
  $$
    insert into public.organisation_membership_roles (membership_id, role)
    values (gen_random_uuid(), 'owner')
  $$,
  null,
  'invalid cumulative role is rejected'
);

select throws_ok(
  $$
    insert into public.organisation_membership_permission_blocks (
      membership_id,
      permission_block
    )
    values (gen_random_uuid(), 'billing')
  $$,
  null,
  'invalid permission block is rejected'
);

select throws_ok(
  $$
    insert into public.daily_documents (
      organisation_id,
      document_type,
      version,
      status,
      logical_name,
      bucket,
      storage_path,
      sha256
    )
    values (
      gen_random_uuid(),
      'programme',
      1,
      'draft',
      'Programme',
      'documents',
      'daily/test/programme.pdf',
      'not-a-sha'
    )
  $$,
  null,
  'invalid sha256 is rejected'
);

select lives_ok(
  $$
    insert into public.daily_audit_logs (
      organisation_id,
      actor_type,
      object_type,
      action,
      origin
    )
    values (
      '00000000-0000-4000-8000-000000001a01',
      'automation',
      'test',
      'created',
      'automation'
    )
  $$,
  'minimal audit log insert shape is valid before RLS role simulation'
);

select throws_ok(
  $$
    insert into public.daily_audit_logs (
      organisation_id,
      actor_type,
      object_type,
      action,
      origin,
      context
    )
    values (
      '00000000-0000-4000-8000-000000001a01',
      'automation',
      'test',
      'created',
      'automation',
      '{"raw_token":"must-not-pass"}'::jsonb
    )
  $$,
  null,
  'audit log rejects raw token-like keys'
);

set local role authenticated;

select throws_ok(
  $$
    update public.daily_audit_logs
    set action = 'changed'
  $$,
  null,
  'audit logs are append-only for non-service users'
);

reset role;

select is_empty(
  $$select 1 from public.organisation_memberships where status not in ('invited', 'active', 'disabled', 'revoked')$$,
  'membership statuses are constrained'
);

select is_empty(
  $$select 1 from public.daily_documents where version <= 0$$,
  'document version must be positive'
);

select isnt_empty(
  $$select 1 from pg_indexes where schemaname = 'public' and indexname = 'daily_documents_one_current_idx'$$,
  'daily_documents has one-current-version index'
);

select isnt_empty(
  $$select 1 from pg_indexes where schemaname = 'public' and indexname = 'daily_audit_logs_organisation_occurred_idx'$$,
  'daily_audit_logs has organisation timeline index'
);

select isnt_empty(
  $$select 1 from pg_policy where polrelid = 'public.organisations'::regclass and polname = 'Active organisation members can read their organisation'$$,
  'organisations member read policy exists'
);

select isnt_empty(
  $$select 1 from pg_policy where polrelid = 'public.daily_documents'::regclass and polname = 'Members can read their organisation Daily documents'$$,
  'daily_documents member read policy exists'
);

select * from finish();

rollback;
