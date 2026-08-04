-- Selen Daily Lot 1A foundation tests.
-- Intended for a controlled database after the local migrations are applied.
-- This file is transactional and must leave no persistent test data.

begin;

create extension if not exists pgtap with schema extensions;

select plan(70);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000001001', 'authenticated', 'authenticated', 'daily-staff@example.invalid', 'test', now(), now(), now()),
  ('00000000-0000-4000-8000-000000001002', 'authenticated', 'authenticated', 'daily-manager-a@example.invalid', 'test', now(), now(), now()),
  ('00000000-0000-4000-8000-000000001003', 'authenticated', 'authenticated', 'daily-trainer-a@example.invalid', 'test', now(), now(), now()),
  ('00000000-0000-4000-8000-000000001004', 'authenticated', 'authenticated', 'daily-assistant-a@example.invalid', 'test', now(), now(), now()),
  ('00000000-0000-4000-8000-000000001005', 'authenticated', 'authenticated', 'daily-manager-b@example.invalid', 'test', now(), now(), now()),
  ('00000000-0000-4000-8000-000000001006', 'authenticated', 'authenticated', 'daily-disabled-a@example.invalid', 'test', now(), now(), now()),
  ('00000000-0000-4000-8000-000000001007', 'authenticated', 'authenticated', 'daily-no-membership@example.invalid', 'test', now(), now(), now());

insert into public.agent_profiles (user_id, email, role, is_active)
values ('00000000-0000-4000-8000-000000001001', 'daily-staff@example.invalid', 'admin', true);

insert into public.organisations (id, name)
values
  ('00000000-0000-4000-8000-000000001a01', 'Daily Lot 1A Test Organisation A'),
  ('00000000-0000-4000-8000-000000001b01', 'Daily Lot 1A Test Organisation B');

insert into public.organisation_memberships (
  id,
  organisation_id,
  user_id,
  status,
  primary_role,
  disabled_at,
  disable_reason
)
values
  ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000001a01', '00000000-0000-4000-8000-000000001002', 'active', 'manager', null, null),
  ('00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000001a01', '00000000-0000-4000-8000-000000001003', 'active', 'trainer', null, null),
  ('00000000-0000-4000-8000-000000002003', '00000000-0000-4000-8000-000000001a01', '00000000-0000-4000-8000-000000001004', 'active', 'admin_assistant', null, null),
  ('00000000-0000-4000-8000-000000002004', '00000000-0000-4000-8000-000000001b01', '00000000-0000-4000-8000-000000001005', 'active', 'manager', null, null),
  ('00000000-0000-4000-8000-000000002005', '00000000-0000-4000-8000-000000001a01', '00000000-0000-4000-8000-000000001006', 'disabled', 'manager', now(), 'Test disabled membership');

insert into public.organisation_membership_roles (membership_id, role)
values
  ('00000000-0000-4000-8000-000000002001', 'manager'),
  ('00000000-0000-4000-8000-000000002002', 'trainer'),
  ('00000000-0000-4000-8000-000000002003', 'admin_assistant'),
  ('00000000-0000-4000-8000-000000002004', 'manager'),
  ('00000000-0000-4000-8000-000000002005', 'manager');

insert into public.daily_documents (
  id,
  organisation_id,
  document_type,
  linked_object_type,
  linked_object_id,
  version,
  status,
  logical_name,
  bucket,
  storage_path,
  sha256,
  is_current,
  validated_at,
  signed_at,
  published_at
)
values
  ('00000000-0000-4000-8000-000000003001', '00000000-0000-4000-8000-000000001a01', 'programme', null, null, 1, 'draft', 'Programme A', 'documents', 'daily/a/programme-a-v1.pdf', repeat('a', 64), true, null, null, null),
  ('00000000-0000-4000-8000-000000003002', '00000000-0000-4000-8000-000000001b01', 'programme', null, null, 1, 'draft', 'Programme B', 'documents', 'daily/b/programme-b-v1.pdf', repeat('b', 64), true, null, null, null),
  ('00000000-0000-4000-8000-000000003003', '00000000-0000-4000-8000-000000001a01', 'convention', null, null, 1, 'signed', 'Convention signee A', 'documents', 'daily/a/convention-signed-v1.pdf', repeat('c', 64), true, now(), now(), now()),
  ('00000000-0000-4000-8000-000000003004', '00000000-0000-4000-8000-000000001a01', 'programme', null, null, 1, 'published', 'Programme publie A', 'documents', 'daily/a/programme-published-v1.pdf', repeat('d', 64), true, now(), null, now());

insert into public.daily_audit_logs (
  organisation_id,
  actor_user_id,
  actor_type,
  object_type,
  action,
  origin
)
values (
  '00000000-0000-4000-8000-000000001a01',
  '00000000-0000-4000-8000-000000001001',
  'selen_admin',
  'setup',
  'created',
  'Studio'
);

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
select has_function('public', 'daily_append_audit_log', array['uuid', 'text', 'text', 'text', 'uuid', 'text', 'jsonb', 'jsonb', 'jsonb', 'inet', 'text', 'text', 'text']::name[], 'daily_append_audit_log exists');

select isnt_empty($$select 1 from pg_class where relname = 'organisations' and relrowsecurity = true$$, 'organisations RLS is enabled');
select isnt_empty($$select 1 from pg_class where relname = 'daily_audit_logs' and relrowsecurity = true$$, 'daily_audit_logs RLS is enabled');
select isnt_empty($$select 1 from pg_class where relname = 'daily_documents' and relrowsecurity = true$$, 'daily_documents RLS is enabled');

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

select isnt_empty($$select 1 from pg_policy where polrelid = 'public.organisations'::regclass and polname = 'Active managers can read their organisation legal profile'$$, 'organisations manager-only read policy exists');
select is_empty($$select 1 from pg_policy where polrelid = 'public.daily_audit_logs'::regclass and polname ilike '%manager%'$$, 'no manager policy exposes full audit logs');
select isnt_empty($$select 1 from pg_indexes where schemaname = 'public' and indexname = 'daily_documents_logical_version_unique_idx'$$, 'daily_documents has NULLS NOT DISTINCT logical version index');
select is_empty($$select 1 from pg_constraint where conname = 'daily_documents_logical_version_unique'$$, 'old nullable unique constraint is not present');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001001', true);
select set_config('request.jwt.claim.email', 'daily-staff@example.invalid', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001001","email":"daily-staff@example.invalid"}', true);

select is((select count(*)::int from public.organisations where id in ('00000000-0000-4000-8000-000000001a01', '00000000-0000-4000-8000-000000001b01')), 2, 'staff reads organisations A and B');
select lives_ok($$insert into public.organisations (id, name) values ('00000000-0000-4000-8000-000000001c01', 'Daily Lot 1A Staff Insert')$$, 'staff can insert organisation');
select lives_ok($$update public.organisations set client_notifications_paused = true where id = '00000000-0000-4000-8000-000000001c01'$$, 'staff can update organisation');
select lives_ok($$select public.daily_append_audit_log('00000000-0000-4000-8000-000000001a01', 'selen_admin', 'admin', 'organisation', '00000000-0000-4000-8000-000000001a01', 'checked')$$, 'staff can append audit log through controlled function');
select lives_ok($$insert into public.daily_audit_logs (organisation_id, actor_user_id, actor_type, object_type, action, origin) values ('00000000-0000-4000-8000-000000001a01', '00000000-0000-4000-8000-000000001007', 'selen_admin', 'organisation', 'spoof_attempt', 'Studio')$$, 'staff direct audit insert is normalised by trigger');
select is((select count(*)::int from public.daily_audit_logs where action = 'spoof_attempt' and actor_user_id = '00000000-0000-4000-8000-000000001001'), 1, 'audit trigger prevents actor_user_id spoofing');
select isnt_empty($$select 1 from public.daily_audit_logs where organisation_id = '00000000-0000-4000-8000-000000001a01'$$, 'staff can read full audit logs');
select lives_ok($$insert into public.daily_documents (organisation_id, document_type, version, status, logical_name, bucket, storage_path, sha256) values ('00000000-0000-4000-8000-000000001a01', 'programme', 2, 'draft', 'Programme staff', 'documents', 'daily/a/programme-staff-v2.pdf', repeat('e', 64))$$, 'staff can insert Daily document');
select lives_ok($$update public.daily_documents set metadata = '{"reviewed":true}'::jsonb where storage_path = 'daily/a/programme-staff-v2.pdf'$$, 'staff can update draft Daily document');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001002', true);
select set_config('request.jwt.claim.email', 'daily-manager-a@example.invalid', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001002","email":"daily-manager-a@example.invalid"}', true);

select is((select count(*)::int from public.organisations), 1, 'manager A reads exactly one organisation legal profile');
select is((select count(*)::int from public.organisations where id = '00000000-0000-4000-8000-000000001b01'), 0, 'manager A cannot read organisation B');
select isnt_empty($$select 1 from public.daily_documents where organisation_id = '00000000-0000-4000-8000-000000001a01'$$, 'manager A reads Daily documents for organisation A');
select lives_ok($$insert into public.daily_documents (organisation_id, document_type, version, status, logical_name, bucket, storage_path, sha256) values ('00000000-0000-4000-8000-000000001a01', 'programme', 3, 'draft', 'Programme manager', 'documents', 'daily/a/programme-manager-v3.pdf', repeat('f', 64))$$, 'manager A can insert Daily document for organisation A');
select throws_ok($$insert into public.daily_documents (organisation_id, document_type, version, status, logical_name, bucket, storage_path, sha256) values ('00000000-0000-4000-8000-000000001b01', 'programme', 2, 'draft', 'Programme forbidden', 'documents', 'daily/b/forbidden.pdf', repeat('1', 64))$$, null, 'manager A cannot insert Daily document for organisation B');
select is((select count(*)::int from public.daily_audit_logs), 0, 'manager A cannot read full audit logs');
select throws_ok($$insert into public.daily_audit_logs (organisation_id, actor_type, object_type, action, origin) values ('00000000-0000-4000-8000-000000001a01', 'organisation_user', 'test', 'created', 'Studio')$$, null, 'manager A cannot directly insert audit logs');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001003', true);
select set_config('request.jwt.claim.email', 'daily-trainer-a@example.invalid', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001003","email":"daily-trainer-a@example.invalid"}', true);

select is((select count(*)::int from public.organisations), 0, 'trainer A cannot read full organisation legal profile');
select isnt_empty($$select 1 from public.daily_documents where organisation_id = '00000000-0000-4000-8000-000000001a01'$$, 'trainer A can read organisation A Daily documents');
select throws_ok($$insert into public.daily_documents (organisation_id, document_type, version, status, logical_name, bucket, storage_path, sha256) values ('00000000-0000-4000-8000-000000001a01', 'support', 1, 'draft', 'Trainer upload', 'documents', 'daily/a/trainer-upload.pdf', repeat('2', 64))$$, null, 'trainer A cannot insert Daily document metadata without document block');
select throws_ok($$update public.daily_documents set metadata = '{"trainer":true}'::jsonb where id = '00000000-0000-4000-8000-000000003001'$$, null, 'trainer A cannot update Daily document metadata without document block');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001004', true);
select set_config('request.jwt.claim.email', 'daily-assistant-a@example.invalid', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001004","email":"daily-assistant-a@example.invalid"}', true);

select is((select count(*)::int from public.organisations), 0, 'admin assistant A cannot read full organisation legal profile');
select isnt_empty($$select 1 from public.daily_documents where organisation_id = '00000000-0000-4000-8000-000000001a01'$$, 'admin assistant A can read organisation A Daily documents');
select throws_ok($$insert into public.daily_documents (organisation_id, document_type, version, status, logical_name, bucket, storage_path, sha256) values ('00000000-0000-4000-8000-000000001a01', 'convocation', 1, 'draft', 'Assistant upload', 'documents', 'daily/a/assistant-upload.pdf', repeat('3', 64))$$, null, 'admin assistant A cannot insert Daily document metadata without document block');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001005', true);
select set_config('request.jwt.claim.email', 'daily-manager-b@example.invalid', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001005","email":"daily-manager-b@example.invalid"}', true);

select is((select count(*)::int from public.daily_documents where organisation_id = '00000000-0000-4000-8000-000000001b01'), 1, 'manager B reads organisation B Daily documents');
select is((select count(*)::int from public.daily_documents where organisation_id = '00000000-0000-4000-8000-000000001a01'), 0, 'manager B cannot read organisation A Daily documents');
select is((select count(*)::int from public.organisations where id = '00000000-0000-4000-8000-000000001a01'), 0, 'manager B cannot read organisation A legal profile');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001006', true);
select set_config('request.jwt.claim.email', 'daily-disabled-a@example.invalid', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001006","email":"daily-disabled-a@example.invalid"}', true);

select is((select count(*)::int from public.organisations), 0, 'disabled member reads no organisation legal profile');
select is((select count(*)::int from public.daily_documents), 0, 'disabled member reads no Daily documents');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.email', '', true);
select set_config('request.jwt.claims', '{}', true);

select is((select count(*)::int from public.organisations), 0, 'anon reads no organisations');
select is((select count(*)::int from public.daily_documents), 0, 'anon reads no Daily documents');
select throws_ok($$insert into public.organisations (id, name) values ('00000000-0000-4000-8000-000000001d01', 'Anon forbidden')$$, null, 'anon cannot insert organisation');
select throws_ok($$select public.daily_append_audit_log('00000000-0000-4000-8000-000000001a01', 'selen_admin', 'admin', 'test', null, 'forbidden')$$, null, 'anon cannot execute controlled audit append');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001007', true);
select set_config('request.jwt.claim.email', 'daily-no-membership@example.invalid', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001007","email":"daily-no-membership@example.invalid"}', true);

select is((select count(*)::int from public.organisations), 0, 'authenticated user without membership reads no organisations');
select is((select count(*)::int from public.daily_documents), 0, 'authenticated user without membership reads no Daily documents');
select throws_ok($$insert into public.daily_documents (organisation_id, document_type, version, status, logical_name, bucket, storage_path, sha256) values ('00000000-0000-4000-8000-000000001a01', 'programme', 9, 'draft', 'No membership', 'documents', 'daily/a/no-membership.pdf', repeat('4', 64))$$, null, 'authenticated user without membership cannot insert Daily document');

reset role;

select throws_ok($$update public.daily_documents set signed_at = null where id = '00000000-0000-4000-8000-000000003003'$$, null, 'signed document cannot remove signed_at');
select throws_ok($$update public.daily_documents set status = 'archived' where id = '00000000-0000-4000-8000-000000003003'$$, null, 'signed document cannot leave signed status');
select throws_ok($$update public.daily_documents set version = 2 where id = '00000000-0000-4000-8000-000000003003'$$, null, 'signed document cannot change version');
select throws_ok($$update public.daily_documents set validated_at = now() + interval '1 day' where id = '00000000-0000-4000-8000-000000003003'$$, null, 'signed document cannot change validation');
select lives_ok($$update public.daily_documents set archived_at = now() where id = '00000000-0000-4000-8000-000000003003'$$, 'signed document allows archived_at only');

select throws_ok($$update public.daily_documents set storage_path = 'daily/a/overwrite-published.pdf' where id = '00000000-0000-4000-8000-000000003004'$$, null, 'published document cannot change storage_path');
select throws_ok($$update public.daily_documents set sha256 = repeat('9', 64) where id = '00000000-0000-4000-8000-000000003004'$$, null, 'published document cannot change sha256');
select lives_ok($$update public.daily_documents set status = 'archived', archived_at = now(), is_current = false where id = '00000000-0000-4000-8000-000000003004'$$, 'published document can be archived without overwriting content');

select lives_ok($$update public.daily_documents set is_current = false where id = '00000000-0000-4000-8000-000000003001'$$, 'old current version can be retired before replacement');
select lives_ok($$insert into public.daily_documents (organisation_id, document_type, linked_object_type, linked_object_id, version, status, logical_name, bucket, storage_path, sha256, is_current, previous_document_id) values ('00000000-0000-4000-8000-000000001a01', 'programme', null, null, 2, 'draft', 'Programme A', 'documents', 'daily/a/programme-a-v2.pdf', repeat('5', 64), true, '00000000-0000-4000-8000-000000003001')$$, 'new version is allowed after retiring current version');
select throws_ok($$insert into public.daily_documents (organisation_id, document_type, linked_object_type, linked_object_id, version, status, logical_name, bucket, storage_path, sha256, is_current) values ('00000000-0000-4000-8000-000000001a01', 'programme', null, null, 3, 'draft', 'Programme A', 'documents', 'daily/a/programme-a-v3.pdf', repeat('6', 64), true)$$, null, 'only one current version is allowed');
select throws_ok($$insert into public.daily_documents (organisation_id, document_type, linked_object_type, linked_object_id, version, status, logical_name, bucket, storage_path, sha256, is_current) values ('00000000-0000-4000-8000-000000001a01', 'programme', null, null, 2, 'draft', 'Programme A', 'documents', 'daily/a/programme-a-v2-duplicate.pdf', repeat('7', 64), false)$$, null, 'duplicate logical version with NULL linked object is refused');
select lives_ok($$insert into public.daily_documents (organisation_id, document_type, linked_object_type, linked_object_id, version, status, logical_name, bucket, storage_path, sha256, is_current) values ('00000000-0000-4000-8000-000000001a01', 'programme', null, null, 1, 'draft', 'Programme A historical copy', 'documents', 'daily/a/programme-a-history.pdf', repeat('8', 64), false)$$, 'non-current historical version with distinct logical name is allowed');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001001', true);
select set_config('request.jwt.claim.email', 'daily-staff@example.invalid', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001001","email":"daily-staff@example.invalid"}', true);

select throws_ok($$update public.daily_audit_logs set action = 'changed'$$, null, 'audit logs are append-only: update refused');
select throws_ok($$delete from public.daily_audit_logs$$, null, 'audit logs are append-only: delete refused');
select throws_ok($$insert into public.daily_audit_logs (organisation_id, actor_type, object_type, action, origin) values ('00000000-0000-4000-8000-000000001a01', 'organisation_user', 'test', 'spoof_actor_type', 'Studio')$$, null, 'staff cannot spoof non-staff actor_type in audit log');

select * from finish();

rollback;
