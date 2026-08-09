-- Selen Daily Lot 1B.2 - transactional regression coverage.
-- Verifies checklist seeding, agent routing, 72h escalation, certification validity,
-- atomic access changes and notification isolation. Leaves no persistent data.

begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

select has_table('public','daily_organisation_assignments','organisation assignment table exists');
select has_table('public','daily_organisation_checklist_items','organisation checklist table exists');
select has_table('public','daily_trainer_certifications','trainer certifications table exists');
select has_column('public','notifications','target_agent_profile_id','notifications target Studio agent profiles');
select has_column('public','notifications','source_key','notifications expose deterministic source keys');
select has_function('public','daily_sync_checklist_notification',array['uuid']::name[],'checklist notification sync exists');
select has_function('public','daily_sync_trainer_certification_notifications',array[]::name[],'certification notification sync exists');
select has_function('public','daily_studio_set_membership_access',array['uuid','uuid','text[]','text[]','uuid']::name[],'atomic Studio access RPC exists');
select isnt_empty($$select 1 from pg_class where oid='public.daily_organisation_assignments'::regclass and relrowsecurity$$,'assignment RLS enabled');
select isnt_empty($$select 1 from pg_class where oid='public.daily_organisation_checklist_items'::regclass and relrowsecurity$$,'checklist RLS enabled');
select isnt_empty($$select 1 from pg_class where oid='public.daily_trainer_certifications'::regclass and relrowsecurity$$,'certification RLS enabled');
select isnt_empty($$select 1 from pg_class where oid='public.notifications'::regclass and relrowsecurity$$,'notifications RLS enabled');
select is_empty($$select 1 from information_schema.role_table_grants where table_schema='public' and table_name in ('daily_organisation_assignments','daily_organisation_checklist_items','notifications') and grantee='anon'$$,'anon has no grants on internal Studio tables');
select is_empty($$select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('daily_sync_checklist_notification','daily_sync_trainer_certification_notifications','daily_studio_set_membership_access') and has_function_privilege('authenticated',p.oid,'EXECUTE')$$,'internal security-definer functions are not directly executable by authenticated');

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('00000000-0000-4000-8400-000000000001','authenticated','authenticated','daily-1b2-test-agent@example.invalid','x',now(),now(),now()),
('00000000-0000-4000-8400-000000000002','authenticated','authenticated','daily-1b2-test-member@example.invalid','x',now(),now(),now());

insert into public.agent_profiles(id,user_id,email,role,is_active,first_name,last_name)
values('00000000-0000-4000-8400-000000000011','00000000-0000-4000-8400-000000000001','daily-1b2-test-agent@example.invalid','agent',true,'Agent','Test');

insert into public.organisations(id,name,siret,email,status)
values('00000000-0000-4000-8400-000000000021','Daily 1B.2 Regression','99999999999999','daily-1b2-regression@example.invalid','active');

select is((select count(*)::int from public.daily_organisation_checklist_items where organisation_id='00000000-0000-4000-8400-000000000021'),7,'new organisation receives seven checklist items');
select is((select count(*)::int from public.notifications where organisation_name='Daily 1B.2 Regression' and source_kind='daily_checklist' and target_role='admin' and target_agent_profile_id is null),7,'unassigned checklist alerts target admins');

insert into public.daily_organisation_assignments(organisation_id,agent_profile_id)
values('00000000-0000-4000-8400-000000000021','00000000-0000-4000-8400-000000000011');
select is((select count(*)::int from public.notifications where organisation_name='Daily 1B.2 Regression' and source_kind='daily_checklist' and target_agent_profile_id='00000000-0000-4000-8400-000000000011'),7,'assignment retargets all checklist alerts');

update public.daily_organisation_checklist_items set status='validated'
where organisation_id='00000000-0000-4000-8400-000000000021' and item_key='legal_identity';
select isnt_empty($$select 1 from public.notifications where source_key like 'daily_checklist:%' and organisation_name='Daily 1B.2 Regression' and content='Vérifier l’identité juridique' and dismissed_at is not null$$,'validated checklist alert is dismissed');

update public.daily_organisation_checklist_items set status='todo'
where organisation_id='00000000-0000-4000-8400-000000000021' and item_key='legal_identity';
select isnt_empty($$select 1 from public.notifications where source_key like 'daily_checklist:%' and organisation_name='Daily 1B.2 Regression' and content='Vérifier l’identité juridique' and dismissed_at is null and read_at is null$$,'reopened checklist alert becomes active and unread');

update public.daily_organisation_checklist_items set signaled_at=now()-interval '73 hours'
where organisation_id='00000000-0000-4000-8400-000000000021' and item_key='legal_identity';
select isnt_empty($$select 1 from public.notifications where organisation_name='Daily 1B.2 Regression' and content='Vérifier l’identité juridique' and escalation_at <= now()$$,'73-hour checklist task is admin-escalatable');

insert into public.daily_trainer_profiles(id,organisation_id,professional_email,display_name,status,engagement_type)
values('00000000-0000-4000-8400-000000000031','00000000-0000-4000-8400-000000000021','trainer-regression@example.invalid','Trainer Regression','draft','external');

select lives_ok($$insert into public.daily_trainer_certifications(trainer_profile_id,title,validity_mode) values('00000000-0000-4000-8400-000000000031','Certification à vie','lifetime')$$,'lifetime certification needs no expiry date');
select throws_ok($$insert into public.daily_trainer_certifications(trainer_profile_id,title,validity_mode,valid_until) values('00000000-0000-4000-8400-000000000031','Lifetime invalide','lifetime',current_date+100)$$,'23514',null,'lifetime certification rejects an expiry date');
select throws_ok($$insert into public.daily_trainer_certifications(trainer_profile_id,title,validity_mode) values('00000000-0000-4000-8400-000000000031','Limited sans date','limited')$$,'23514',null,'limited certification requires an expiry date');
select throws_ok($$insert into public.daily_trainer_certifications(trainer_profile_id,title,validity_mode,valid_until) values('00000000-0000-4000-8400-000000000031','Unknown avec date','unknown',current_date+100)$$,'23514',null,'unknown validity rejects a contradictory expiry date');
select lives_ok($$insert into public.daily_trainer_certifications(trainer_profile_id,title,validity_mode,valid_until) values('00000000-0000-4000-8400-000000000031','Habilitation renouvelable','limited',current_date+30)$$,'limited certification accepts an expiry date');
select lives_ok($$select public.daily_sync_trainer_certification_notifications()$$,'certification reminders synchronize');
select isnt_empty($$select 1 from public.notifications where source_kind='daily_trainer_certification' and organisation_name='Daily 1B.2 Regression' and target_agent_profile_id='00000000-0000-4000-8400-000000000011' and dismissed_at is null$$,'renewal reminder targets assigned agent');

insert into public.organisation_memberships(id,organisation_id,user_id,status,primary_role)
values('00000000-0000-4000-8400-000000000041','00000000-0000-4000-8400-000000000021','00000000-0000-4000-8400-000000000002','active','manager');
insert into public.organisation_membership_roles(membership_id,role)
values('00000000-0000-4000-8400-000000000041','manager');
select lives_ok($$select public.daily_studio_set_membership_access('00000000-0000-4000-8400-000000000021','00000000-0000-4000-8400-000000000041',array['manager','trainer'],array['users','trainers'],null)$$,'Studio access update is atomic and valid');
select is((select count(*)::int from public.organisation_membership_roles where membership_id='00000000-0000-4000-8400-000000000041' and role in ('manager','trainer')),2,'two requested roles are persisted');
select is((select count(*)::int from public.organisation_membership_permission_blocks where membership_id='00000000-0000-4000-8400-000000000041' and permission_block in ('users','trainers') and enabled=true and revoked_at is null),2,'two requested permission blocks are persisted');

select * from finish();
rollback;
