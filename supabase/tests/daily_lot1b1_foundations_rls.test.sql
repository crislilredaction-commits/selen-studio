-- Selen Daily Lot 1B.1 foundation tests.
-- Transactional pgTAP file. It must leave no persistent test data.
-- The compatibility overload below is also transaction-scoped and disappears on rollback.

begin;

create extension if not exists pgtap with schema extensions;

-- Historical Lot 1B.1 assertions used throws_ok(sql, code, description).
-- pgTAP's native 3-argument overload interprets the third value as the exact error
-- message, so provide the intended description semantics transactionally.
create or replace function public.throws_ok(sql text, errcode text, description text)
returns text
language sql
as $$
  select extensions.throws_ok(sql, errcode::character(5), null::text, description);
$$;

select plan(110);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-4000-8100-000000000001', 'authenticated', 'authenticated', 'daily-1b1-staff@example.invalid', 'test', now(), now(), now()),
  ('00000000-0000-4000-8100-000000000002', 'authenticated', 'authenticated', 'daily-1b1-manager-a@example.invalid', 'test', now(), now(), now()),
  ('00000000-0000-4000-8100-000000000003', 'authenticated', 'authenticated', 'daily-1b1-trainer-a@example.invalid', 'test', now(), now(), now()),
  ('00000000-0000-4000-8100-000000000004', 'authenticated', 'authenticated', 'daily-1b1-assistant-a@example.invalid', 'test', now(), now(), now()),
  ('00000000-0000-4000-8100-000000000005', 'authenticated', 'authenticated', 'daily-1b1-manager-b@example.invalid', 'test', now(), now(), now()),
  ('00000000-0000-4000-8100-000000000006', 'authenticated', 'authenticated', 'daily-1b1-disabled@example.invalid', 'test', now(), now(), now()),
  ('00000000-0000-4000-8100-000000000007', 'authenticated', 'authenticated', 'daily-1b1-no-membership@example.invalid', 'test', now(), now(), now()),
  ('00000000-0000-4000-8100-000000000008', 'authenticated', 'authenticated', 'daily-1b1-trainer-b@example.invalid', 'test', now(), now(), now()),
  ('00000000-0000-4000-8100-000000000009', 'authenticated', 'authenticated', 'trainer2@example.invalid', 'test', now(), now(), now()),
  ('00000000-0000-4000-8100-000000000010', 'authenticated', 'authenticated', 'expired@example.invalid', 'test', now(), now(), now()),
  ('00000000-0000-4000-8100-000000000011', 'authenticated', 'authenticated', 'draft-trainer@example.invalid', 'test', now(), now(), now()),
  ('00000000-0000-4000-8100-000000000012', 'authenticated', 'authenticated', 'validation-probe@example.invalid', 'test', now(), now(), now());

insert into public.selen_admin_users (user_id, email, role, is_active)
values ('00000000-0000-4000-8100-000000000001', 'daily-1b1-staff@example.invalid', 'admin', true);

insert into public.agent_profiles (user_id, email, role, is_active)
values ('00000000-0000-4000-8100-000000000001', 'daily-1b1-staff@example.invalid', 'admin', true);

insert into public.organisations (id, name, legal_name, siret, email, phone, address, contact_name)
values
  ('00000000-0000-4000-8100-0000000000a1', 'Daily Lot 1B.1 Organisation A', 'Organisation A Legal', '11111111111111', 'a@example.invalid', '0101010101', '1 rue A', 'Contact A'),
  ('00000000-0000-4000-8100-0000000000b1', 'Daily Lot 1B.1 Organisation B', 'Organisation B Legal', '22222222222222', 'b@example.invalid', '0202020202', '2 rue B', 'Contact B');

insert into public.organisation_memberships (id, organisation_id, user_id, status, primary_role, disabled_at, disable_reason)
values
  ('00000000-0000-4000-8100-000000000101', '00000000-0000-4000-8100-0000000000a1', '00000000-0000-4000-8100-000000000002', 'active', 'manager', null, null),
  ('00000000-0000-4000-8100-000000000102', '00000000-0000-4000-8100-0000000000a1', '00000000-0000-4000-8100-000000000003', 'active', 'trainer', null, null),
  ('00000000-0000-4000-8100-000000000103', '00000000-0000-4000-8100-0000000000a1', '00000000-0000-4000-8100-000000000004', 'active', 'admin_assistant', null, null),
  ('00000000-0000-4000-8100-000000000104', '00000000-0000-4000-8100-0000000000b1', '00000000-0000-4000-8100-000000000005', 'active', 'manager', null, null),
  ('00000000-0000-4000-8100-000000000105', '00000000-0000-4000-8100-0000000000a1', '00000000-0000-4000-8100-000000000006', 'disabled', 'manager', now(), 'disabled test membership'),
  ('00000000-0000-4000-8100-000000000106', '00000000-0000-4000-8100-0000000000a1', '00000000-0000-4000-8100-000000000008', 'active', 'trainer', null, null),
  ('00000000-0000-4000-8100-000000000107', '00000000-0000-4000-8100-0000000000a1', '00000000-0000-4000-8100-000000000011', 'active', 'trainer', null, null),
  ('00000000-0000-4000-8100-000000000108', '00000000-0000-4000-8100-0000000000a1', '00000000-0000-4000-8100-000000000012', 'active', 'trainer', null, null);

insert into public.organisation_membership_roles (id, membership_id, role)
values
  ('00000000-0000-4000-8100-000000000111', '00000000-0000-4000-8100-000000000101', 'manager'),
  ('00000000-0000-4000-8100-000000000112', '00000000-0000-4000-8100-000000000102', 'trainer'),
  ('00000000-0000-4000-8100-000000000113', '00000000-0000-4000-8100-000000000103', 'admin_assistant'),
  ('00000000-0000-4000-8100-000000000114', '00000000-0000-4000-8100-000000000104', 'manager'),
  ('00000000-0000-4000-8100-000000000115', '00000000-0000-4000-8100-000000000105', 'manager'),
  ('00000000-0000-4000-8100-000000000116', '00000000-0000-4000-8100-000000000106', 'trainer'),
  ('00000000-0000-4000-8100-000000000117', '00000000-0000-4000-8100-000000000107', 'trainer'),
  ('00000000-0000-4000-8100-000000000118', '00000000-0000-4000-8100-000000000108', 'trainer');

insert into public.organisation_membership_permission_blocks (membership_id, permission_block, enabled)
values
  ('00000000-0000-4000-8100-000000000101', 'users', true),
  ('00000000-0000-4000-8100-000000000101', 'permanent_documents', true),
  ('00000000-0000-4000-8100-000000000103', 'users', true);

insert into public.daily_documents (
  id, organisation_id, document_type, linked_object_type, linked_object_id,
  version, status, logical_name, bucket, storage_path, sha256, is_current
)
values
  ('00000000-0000-4000-8100-000000000201', '00000000-0000-4000-8100-0000000000a1', 'trainer_cv', null, null, 1, 'draft', 'CV formateur A', 'documents', 'daily/1b1/a/trainer-cv-v1.pdf', repeat('a', 64), true),
  ('00000000-0000-4000-8100-000000000202', '00000000-0000-4000-8100-0000000000b1', 'trainer_cv', null, null, 1, 'draft', 'CV formateur B org B', 'documents', 'daily/1b1/b/trainer-cv-v1.pdf', repeat('b', 64), true),
  ('00000000-0000-4000-8100-000000000203', '00000000-0000-4000-8100-0000000000a1', 'trainer_cv', null, null, 2, 'draft', 'CV formateur B org A', 'documents', 'daily/1b1/a/trainer-b-v1.pdf', repeat('c', 64), true);

select has_column('public', 'organisations', 'legal_name', 'organisations.legal_name exists');
select has_column('public', 'organisations', 'administrative_email', 'organisations.administrative_email exists');
select has_column('public', 'organisations', 'qualiopi_status', 'organisations.qualiopi_status exists');
select has_column('public', 'organisations', 'nda_status', 'organisations.nda_status exists');
select has_table('public', 'daily_organisation_profile_change_requests', 'profile change request table exists');
select has_table('public', 'daily_organisation_invitations', 'invitations table exists');
select has_table('public', 'daily_trainer_profiles', 'trainer profiles table exists');
select has_table('public', 'daily_trainer_profile_internal_notes', 'trainer internal notes table exists');
select has_table('public', 'daily_trainer_profile_documents', 'trainer profile document links table exists');
select has_table('public', 'daily_trainer_condition_acceptances', 'trainer condition acceptances table exists');
select has_function('public', 'daily_create_organisation_invitation', array['uuid','text','text[]','text[]','text']::name[], 'controlled invitation creation function exists');
select has_function('public', 'daily_accept_organisation_invitation', array['text']::name[], 'controlled invitation acceptance function exists');
select has_function('public', 'prevent_last_daily_organisation_manager_loss', array[]::name[], 'last manager guard exists');
select has_function('public', 'validate_daily_trainer_profile_document_organisation', array[]::name[], 'trainer document organisation guard exists');
select isnt_empty($$select 1 from pg_class where relname='daily_organisation_invitations' and relrowsecurity=true$$, 'invitations RLS enabled');
select isnt_empty($$select 1 from pg_class where relname='daily_trainer_profiles' and relrowsecurity=true$$, 'trainer profiles RLS enabled');
select isnt_empty($$select 1 from pg_class where relname='daily_trainer_profile_internal_notes' and relrowsecurity=true$$, 'trainer internal notes RLS enabled');
select isnt_empty($$select 1 from pg_class where relname='daily_trainer_profile_documents' and relrowsecurity=true$$, 'trainer document links RLS enabled');
select isnt_empty($$select 1 from pg_class where relname='daily_trainer_condition_acceptances' and relrowsecurity=true$$, 'trainer condition acceptances RLS enabled');
select is_empty($$select 1 from information_schema.role_table_grants where table_schema='public' and table_name in ('daily_organisation_invitations','daily_trainer_profiles','daily_trainer_profile_internal_notes','daily_trainer_profile_documents','daily_trainer_condition_acceptances') and grantee='anon'$$, 'anon has no grants on Lot 1B.1 tables');
select is_empty($$select 1 from information_schema.role_table_grants where table_schema='public' and table_name='daily_organisation_invitations' and grantee='authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')$$, 'authenticated has no direct write grant on invitations');
select is_empty($$select 1 from information_schema.role_table_grants where table_schema='public' and table_name in ('daily_organisation_invitations','daily_trainer_profiles','daily_trainer_profile_internal_notes','daily_trainer_profile_documents','daily_trainer_condition_acceptances') and grantee='authenticated' and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')$$, 'authenticated has no dangerous table grants');
select is_empty($$select 1 from information_schema.role_table_grants where table_schema='public' and table_name='daily_trainer_condition_acceptances' and grantee='authenticated' and privilege_type in ('UPDATE','DELETE')$$, 'trainer condition acceptances are not directly updatable/deletable');
select isnt_empty($$select 1 from pg_indexes where schemaname='public' and indexname='daily_organisation_invitations_one_pending_email_idx'$$, 'one pending invitation per organisation/email index exists');
select isnt_empty($$select 1 from pg_indexes where schemaname='public' and indexname='daily_trainer_profiles_org_membership_unique_idx'$$, 'trainer profile organisation/membership uniqueness exists');
select isnt_empty($$select 1 from pg_proc where proname='prevent_last_daily_organisation_manager_loss' and pg_get_functiondef(oid) ilike '%for update%'$$, 'last manager guard locks organisation row before counting');
select is_empty($$select 1 from information_schema.columns where table_schema='public' and table_name='daily_trainer_condition_acceptances' and column_name in ('revoked_at','revocation_reason')$$, 'append-only acceptances do not expose unusable revocation columns');
select throws_ok($$insert into public.organisation_membership_permission_blocks(membership_id,permission_block) values('00000000-0000-4000-8100-000000000101','documents')$$, '23514', 'generic documents permission block is refused');
select throws_ok($$insert into public.daily_organisation_profile_change_requests(organisation_id,requested_by,status,request_type,proposed_changes) values('00000000-0000-4000-8100-0000000000a1','00000000-0000-4000-8100-000000000002','pending','legal_identity','{"secret":"bad"}')$$, '23514', 'profile change request rejects keys outside allowlist');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8100-000000000001',true);
select set_config('request.jwt.claim.email','daily-1b1-staff@example.invalid',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8100-000000000001","email":"daily-1b1-staff@example.invalid"}',true);
select is((select count(*)::int from public.organisations where id in ('00000000-0000-4000-8100-0000000000a1','00000000-0000-4000-8100-0000000000b1')), 2, 'staff reads both organisations');
select lives_ok($$update public.organisations set legal_name='Organisation A Legal Reviewed' where id='00000000-0000-4000-8100-0000000000a1'$$, 'staff can edit sensitive legal organisation fields');
select lives_ok($$insert into public.daily_trainer_profiles(id,organisation_id,membership_id,display_name,status,engagement_type,selen_validated_at,selen_validated_by) values('00000000-0000-4000-8100-000000000301','00000000-0000-4000-8100-0000000000a1','00000000-0000-4000-8100-000000000102','Trainer A','validated','subcontractor',now(),'00000000-0000-4000-8100-000000000001')$$, 'staff can create validated trainer profile A');
select lives_ok($$insert into public.daily_trainer_profiles(id,organisation_id,membership_id,display_name,status,engagement_type,selen_validated_at,selen_validated_by) values('00000000-0000-4000-8100-000000000302','00000000-0000-4000-8100-0000000000a1','00000000-0000-4000-8100-000000000106','Trainer B same org','validated','employee',now(),'00000000-0000-4000-8100-000000000001')$$, 'staff can create validated trainer profile B same organisation');
select is((select user_id from public.daily_trainer_profiles where id='00000000-0000-4000-8100-000000000301'), '00000000-0000-4000-8100-000000000003'::uuid, 'trainer profile user_id is derived from membership');
select lives_ok($$insert into public.daily_trainer_profile_internal_notes(trainer_profile_id,validation_notes,internal_metadata,created_by) values('00000000-0000-4000-8100-000000000301','Note interne staff','{"risk":"low"}','00000000-0000-4000-8100-000000000001')$$, 'staff can create internal trainer note');
select lives_ok($$insert into public.daily_trainer_profile_documents(trainer_profile_id,daily_document_id,document_purpose,verified_at,verified_by) values('00000000-0000-4000-8100-000000000301','00000000-0000-4000-8100-000000000201','cv',now(),'00000000-0000-4000-8100-000000000001')$$, 'staff can link trainer A document');
select lives_ok($$insert into public.daily_trainer_profile_documents(trainer_profile_id,daily_document_id,document_purpose,verified_at,verified_by) values('00000000-0000-4000-8100-000000000302','00000000-0000-4000-8100-000000000203','cv',now(),'00000000-0000-4000-8100-000000000001')$$, 'staff can link trainer B same-org document');
select throws_ok($$insert into public.daily_trainer_profile_documents(trainer_profile_id,daily_document_id,document_purpose) values('00000000-0000-4000-8100-000000000301','00000000-0000-4000-8100-000000000202','qualification')$$, 'P0001', 'document from organisation B cannot be linked to trainer profile A');
select lives_ok($$insert into public.daily_organisation_profile_change_requests(organisation_id,requested_by,reviewed_by,status,request_type,proposed_changes,reviewed_at) values('00000000-0000-4000-8100-0000000000a1','00000000-0000-4000-8100-000000000002','00000000-0000-4000-8100-000000000001','approved','legal_identity','{"legal_name":"Reviewed"}',now())$$, 'staff can approve sensitive profile change request');
select lives_ok($$select public.daily_create_organisation_invitation('00000000-0000-4000-8100-0000000000a1','staff-manager@example.invalid',array['manager'],array['users'],repeat('1',64))$$, 'staff can create manager invitation');
select throws_ok($$select public.daily_create_organisation_invitation('00000000-0000-4000-8100-0000000000a1','raw-token@example.invalid',array['trainer'],array[]::text[],'not-a-hash')$$, '23514', 'raw invitation token is refused by hash constraint');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8100-000000000002',true);
select set_config('request.jwt.claim.email','daily-1b1-manager-a@example.invalid',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8100-000000000002","email":"daily-1b1-manager-a@example.invalid"}',true);
select is((select count(*)::int from public.organisations), 1, 'manager A reads only organisation A');
select lives_ok($$update public.organisations set administrative_email='safe-a@example.invalid',administrative_phone='0303030303',administrative_address='3 rue A',contact_name='Safe Contact A' where id='00000000-0000-4000-8100-0000000000a1'$$, 'manager can edit safe organisation fields');
select throws_ok($$update public.organisations set legal_name='Manager Illegal Legal Name' where id='00000000-0000-4000-8100-0000000000a1'$$, 'P0001', 'manager cannot edit sensitive legal field directly');
select lives_ok($$insert into public.daily_organisation_profile_change_requests(organisation_id,requested_by,status,request_type,proposed_changes) values('00000000-0000-4000-8100-0000000000a1','00000000-0000-4000-8100-000000000002','pending','legal_identity','{"legal_name":"Proposal"}')$$, 'manager can submit sensitive profile change request');
select throws_ok($$select public.daily_create_organisation_invitation('00000000-0000-4000-8100-0000000000a1','trainer2@example.invalid',array['trainer'],array['trainers'],repeat('2',64))$$, 'P0001', 'manager cannot transmit trainers block before receiving it');
select throws_ok($$select public.daily_create_organisation_invitation('00000000-0000-4000-8100-0000000000a1','manager2@example.invalid',array['manager'],array['users'],repeat('3',64))$$, 'P0001', 'manager cannot invite another manager');

reset role;
insert into public.organisation_membership_permission_blocks(membership_id,permission_block,enabled)
values ('00000000-0000-4000-8100-000000000101','trainers',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8100-000000000002',true);
select set_config('request.jwt.claim.email','daily-1b1-manager-a@example.invalid',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8100-000000000002","email":"daily-1b1-manager-a@example.invalid"}',true);
select lives_ok($$select public.daily_create_organisation_invitation('00000000-0000-4000-8100-0000000000a1','trainer2@example.invalid',array['trainer'],array['trainers'],repeat('2',64))$$, 'manager can transmit trainers block after receiving it');
select throws_ok($$update public.daily_organisation_invitations set status='accepted',accepted_user_id='00000000-0000-4000-8100-000000000002',accepted_at=now() where token_hash=repeat('2',64)$$, '42501', 'manager cannot falsify invitation acceptance by direct update');
select lives_ok($$select public.daily_resend_organisation_invitation((select id from public.daily_organisation_invitations where token_hash=repeat('2',64)),repeat('a',64))$$, 'manager can resend pending invitation through controlled function');
select is((select status from public.daily_organisation_invitations where token_hash=repeat('2',64)), 'superseded', 'old token is superseded after resend');
select is((select status from public.daily_organisation_invitations where token_hash=repeat('a',64)), 'pending', 'new token is pending after resend');
select is((select resend_count from public.daily_organisation_invitations where token_hash=repeat('a',64)), 1, 'resend_count is incremented on new invitation');
select is((select superseded_by from public.daily_organisation_invitations where token_hash=repeat('2',64)), (select id from public.daily_organisation_invitations where token_hash=repeat('a',64)), 'old invitation points to superseding invitation');
select throws_ok($$insert into public.daily_organisation_invitations(organisation_id,invited_email,normalized_email,invited_by,intended_roles,token_hash,expires_at) values('00000000-0000-4000-8100-0000000000a1','direct@example.invalid','direct@example.invalid','00000000-0000-4000-8100-000000000002',array['trainer'],repeat('d',64),now()+interval '7 days')$$, '42501', 'manager has no direct invitation insert grant');
select lives_ok($$select public.daily_create_organisation_invitation('00000000-0000-4000-8100-0000000000a1','revoke-me@example.invalid',array['trainer'],array[]::text[],repeat('b',64))$$, 'manager can create invitation to revoke');
select lives_ok($$select public.daily_revoke_organisation_invitation((select id from public.daily_organisation_invitations where token_hash=repeat('b',64)))$$, 'manager can revoke own-organisation pending invitation');
select is((select status from public.daily_organisation_invitations where token_hash=repeat('b',64)), 'revoked', 'revoked invitation status is persisted');
select is((select revoked_by from public.daily_organisation_invitations where token_hash=repeat('b',64)), '00000000-0000-4000-8100-000000000002'::uuid, 'revocation stores current actor');
select lives_ok($$select public.daily_create_organisation_invitation('00000000-0000-4000-8100-0000000000a1','cross-revoke@example.invalid',array['trainer'],array[]::text[],repeat('c',64))$$, 'manager creates pending invitation for inter-organisation revocation test');
select lives_ok($$insert into public.daily_trainer_profiles(id,organisation_id,membership_id,display_name,status,engagement_type) values('00000000-0000-4000-8100-000000000303','00000000-0000-4000-8100-0000000000a1','00000000-0000-4000-8100-000000000107','Trainer draft','pending_selen_review','external')$$, 'manager can prepare trainer profile pending Selen review');
select throws_ok($$update public.daily_trainer_profiles set selen_validated_at=now(),selen_validated_by='00000000-0000-4000-8100-000000000002' where id='00000000-0000-4000-8100-000000000303'$$, '42501', 'manager cannot modify Selen validation fields');
select throws_ok($$insert into public.daily_trainer_profiles(organisation_id,membership_id,display_name,status,engagement_type,selen_validated_at,selen_validated_by) values('00000000-0000-4000-8100-0000000000a1','00000000-0000-4000-8100-000000000108','Validation probe','validated','subcontractor',now(),'00000000-0000-4000-8100-000000000002')$$, '42501', 'manager cannot final-validate trainer profile');
select is((select count(*)::int from public.daily_trainer_profile_internal_notes), 0, 'manager cannot read staff-only internal trainer notes');

-- Test the database-level last-manager guard as the privileged writer that can reach it.
reset role;
select throws_ok($$update public.organisation_memberships set status='revoked' where id='00000000-0000-4000-8100-000000000101'$$, 'P0001', 'last active manager cannot be revoked');
select throws_ok($$update public.organisation_membership_roles set membership_id='00000000-0000-4000-8100-000000000102' where id='00000000-0000-4000-8100-000000000111'$$, 'P0001', 'last active manager role cannot be moved to another membership');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8100-000000000003',true);
select set_config('request.jwt.claim.email','daily-1b1-trainer-a@example.invalid',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8100-000000000003","email":"daily-1b1-trainer-a@example.invalid"}',true);
select is((select count(*)::int from public.organisations), 0, 'trainer has no full organisation legal profile access');
select is((select count(*)::int from public.daily_trainer_profiles where id='00000000-0000-4000-8100-000000000301'), 1, 'trainer reads own trainer profile');
select is((select count(*)::int from public.daily_trainer_profiles where id='00000000-0000-4000-8100-000000000302'), 0, 'trainer A does not read trainer B in same organisation');
select is((select count(*)::int from public.daily_trainer_profile_documents), 1, 'trainer reads only own trainer document links');
select lives_ok($$insert into public.daily_trainer_condition_acceptances(trainer_profile_id,accepted_by,condition_type,condition_version,evidence_hash) values('00000000-0000-4000-8100-000000000301','00000000-0000-4000-8100-000000000003','subcontractor_terms','2026-08-04',repeat('4',64))$$, 'subcontractor trainer can accept current conditions');
select throws_ok($$update public.daily_trainer_condition_acceptances set user_agent='changed' where trainer_profile_id='00000000-0000-4000-8100-000000000301'$$, '42501', 'trainer cannot update append-only condition acceptance');
select throws_ok($$insert into public.daily_trainer_condition_acceptances(trainer_profile_id,accepted_by,condition_type,condition_version,evidence_hash) values('00000000-0000-4000-8100-000000000301','00000000-0000-4000-8100-000000000002','subcontractor_terms','2026-08-04-bad',repeat('5',64))$$, '42501', 'trainer cannot accept conditions as another user');
select is((select count(*)::int from public.daily_organisation_invitations), 0, 'trainer cannot read invitations');
select is((select count(*)::int from public.daily_trainer_profile_internal_notes), 0, 'trainer cannot read staff-only internal trainer notes');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8100-000000000004',true);
select set_config('request.jwt.claim.email','daily-1b1-assistant-a@example.invalid',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8100-000000000004","email":"daily-1b1-assistant-a@example.invalid"}',true);
select is((select count(*)::int from public.organisations), 0, 'admin assistant has no full organisation legal profile access');
select is((select count(*)::int from public.daily_trainer_profiles), 0, 'admin assistant does not read trainer profiles by default');
select lives_ok($$select public.daily_create_organisation_invitation('00000000-0000-4000-8100-0000000000a1','assistant-trainer@example.invalid',array['trainer'],array[]::text[],repeat('6',64))$$, 'admin assistant with users block can invite trainer without blocks');
select throws_ok($$select public.daily_create_organisation_invitation('00000000-0000-4000-8100-0000000000a1','assistant-manager@example.invalid',array['manager'],array[]::text[],repeat('7',64))$$, 'P0001', 'admin assistant with users block cannot invite manager');
select throws_ok($$select public.daily_create_organisation_invitation('00000000-0000-4000-8100-0000000000a1','assistant-blocks@example.invalid',array['trainer'],array['legal_profile'],repeat('8',64))$$, 'P0001', 'admin assistant with users block cannot grant permission blocks');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8100-000000000005',true);
select set_config('request.jwt.claim.email','daily-1b1-manager-b@example.invalid',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8100-000000000005","email":"daily-1b1-manager-b@example.invalid"}',true);
select is((select count(*)::int from public.organisations where id='00000000-0000-4000-8100-0000000000a1'), 0, 'manager B cannot read organisation A');
select is((select count(*)::int from public.daily_trainer_profiles where organisation_id='00000000-0000-4000-8100-0000000000a1'), 0, 'manager B cannot read organisation A trainers');
select throws_ok($$insert into public.daily_organisation_profile_change_requests(organisation_id,requested_by,status,request_type,proposed_changes) values('00000000-0000-4000-8100-0000000000a1','00000000-0000-4000-8100-000000000005','pending','legal_identity','{"legal_name":"Bad"}')$$, '42501', 'manager B cannot submit change request for organisation A');
select throws_ok($$select public.daily_revoke_organisation_invitation((select id from public.daily_organisation_invitations where token_hash=repeat('c',64)))$$, 'P0001', 'manager B cannot revoke organisation A invitation');

reset role;
insert into public.daily_organisation_invitations (
  organisation_id, invited_email, normalized_email, invited_by,
  intended_roles, intended_permission_blocks, token_hash, expires_at, created_at
)
values
  ('00000000-0000-4000-8100-0000000000a1','daily-1b1-disabled@example.invalid','daily-1b1-disabled@example.invalid','00000000-0000-4000-8100-000000000001',array['trainer'],array[]::text[],repeat('e',64),now()+interval '7 days',now()),
  ('00000000-0000-4000-8100-0000000000a1','expired@example.invalid','expired@example.invalid','00000000-0000-4000-8100-000000000001',array['trainer'],array[]::text[],repeat('f',64),now()-interval '1 day',now()-interval '2 days');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8100-000000000006',true);
select set_config('request.jwt.claim.email','daily-1b1-disabled@example.invalid',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8100-000000000006","email":"daily-1b1-disabled@example.invalid"}',true);
select is((select count(*)::int from public.organisations), 0, 'disabled member reads no organisation');
select is((select count(*)::int from public.daily_trainer_profiles), 0, 'disabled member reads no trainer profile');
select throws_ok($$select public.daily_create_organisation_invitation('00000000-0000-4000-8100-0000000000a1','disabled@example.invalid',array['trainer'],array[]::text[],repeat('9',64))$$, 'P0001', 'disabled member cannot invite');
select throws_ok($$select * from public.daily_accept_organisation_invitation(repeat('e',64))$$, 'P0001', 'disabled membership cannot be reactivated by invitation acceptance');
reset role;
select is((select status from public.daily_organisation_invitations where token_hash=repeat('e',64)), 'pending', 'disabled-member failed acceptance leaves invitation pending');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8100-000000000007',true);
select set_config('request.jwt.claim.email','daily-1b1-no-membership@example.invalid',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8100-000000000007","email":"daily-1b1-no-membership@example.invalid"}',true);
select is((select count(*)::int from public.organisations), 0, 'authenticated user without membership reads no organisation');
select is((select count(*)::int from public.daily_trainer_profiles), 0, 'authenticated user without membership reads no trainer profile');
select throws_ok($$insert into public.daily_trainer_profiles(organisation_id,user_id,display_name,status,engagement_type) values('00000000-0000-4000-8100-0000000000a1','00000000-0000-4000-8100-000000000007','No membership trainer','pending_selen_review','subcontractor')$$, '42501', 'authenticated user without membership cannot create trainer profile');
select throws_ok($$select * from public.daily_accept_organisation_invitation(repeat('a',64))$$, 'P0001', 'wrong email cannot accept invitation');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8100-000000000009',true);
select set_config('request.jwt.claim.email','trainer2@example.invalid',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8100-000000000009","email":"trainer2@example.invalid"}',true);
select lives_ok($$select * from public.daily_accept_organisation_invitation(repeat('a',64))$$, 'existing Auth user accepts active invitation');
reset role;
select is((select status from public.daily_organisation_invitations where token_hash=repeat('a',64)), 'accepted', 'accepted invitation status is persisted');
select is((select count(*)::int from public.organisation_memberships where organisation_id='00000000-0000-4000-8100-0000000000a1' and user_id='00000000-0000-4000-8100-000000000009'), 1, 'acceptance creates exactly one membership');
select is((select status from public.organisation_memberships where organisation_id='00000000-0000-4000-8100-0000000000a1' and user_id='00000000-0000-4000-8100-000000000009'), 'active', 'created membership is active');
select isnt_empty($$select 1 from public.organisation_membership_roles omr join public.organisation_memberships om on om.id=omr.membership_id where om.organisation_id='00000000-0000-4000-8100-0000000000a1' and om.user_id='00000000-0000-4000-8100-000000000009' and omr.role='trainer'$$, 'acceptance assigns intended trainer role');
select isnt_empty($$select 1 from public.organisation_membership_permission_blocks omp join public.organisation_memberships om on om.id=omp.membership_id where om.organisation_id='00000000-0000-4000-8100-0000000000a1' and om.user_id='00000000-0000-4000-8100-000000000009' and omp.permission_block='trainers' and omp.enabled=true and omp.revoked_at is null$$, 'acceptance assigns intended trainers block');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8100-000000000009',true);
select set_config('request.jwt.claim.email','trainer2@example.invalid',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8100-000000000009","email":"trainer2@example.invalid"}',true);
select throws_ok($$select * from public.daily_accept_organisation_invitation(repeat('a',64))$$, 'P0001', 'double acceptance is refused after status changes from pending');
select throws_ok($$select * from public.daily_accept_organisation_invitation(repeat('2',64))$$, 'P0001', 'old superseded token cannot be accepted');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8100-000000000010',true);
select set_config('request.jwt.claim.email','expired@example.invalid',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8100-000000000010","email":"expired@example.invalid"}',true);
select throws_ok($$select * from public.daily_accept_organisation_invitation(repeat('f',64))$$, 'P0001', 'expired invitation is refused without persisting expired status');
reset role;
select is((select status from public.daily_organisation_invitations where token_hash=repeat('f',64)), 'pending', 'expired accept strategy leaves status pending because exception rolls back no update');

set local role anon;
select throws_ok($$select count(*) from public.daily_organisation_invitations$$, '42501', 'anon cannot read invitations');
select throws_ok($$select count(*) from public.daily_trainer_profiles$$, '42501', 'anon cannot read trainer profiles');
select throws_ok($$select count(*) from public.daily_trainer_condition_acceptances$$, '42501', 'anon cannot read trainer condition acceptances');

reset role;
select is_empty($$select 1 from public.daily_organisation_invitations where token_hash !~ '^[A-Fa-f0-9]{64}$'$$, 'no invitation stores a raw token');
select is_empty($$select 1 from public.daily_organisation_profile_change_requests where proposed_changes::text ~* '(raw_token|access_token|refresh_token|secret|password)'$$, 'profile change requests contain no obvious secrets');
select is_empty($$select 1 from public.daily_trainer_profile_internal_notes where internal_metadata::text ~* '(raw_token|access_token|refresh_token|secret|password)'$$, 'trainer internal notes metadata contains no obvious secrets');
select is_empty($$select 1 from public.daily_trainer_condition_acceptances where metadata::text ~* '(raw_token|access_token|refresh_token|secret|password)'$$, 'condition acceptance metadata contains no obvious secrets');

select * from finish();

rollback;
