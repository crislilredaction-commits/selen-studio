-- Selen Daily Lot 1B.3 - transactional client foundation coverage.
-- All synthetic data is rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('12000000-0000-4000-8400-000000000001','authenticated','authenticated','daily-1b3-manager@example.invalid','x',now(),now(),now()),
('12000000-0000-4000-8400-000000000002','authenticated','authenticated','daily-1b3-trainer@example.invalid','x',now(),now(),now()),
('12000000-0000-4000-8400-000000000003','authenticated','authenticated','daily-1b3-other@example.invalid','x',now(),now(),now()),
('12000000-0000-4000-8400-000000000004','authenticated','authenticated','daily-1b3-noaccess@example.invalid','x',now(),now(),now());

insert into public.daily_subscriptions(user_id,status,annual_learner_limit,base_monthly_amount_cents,upper_monthly_amount_cents,pricing_rule_accepted_at,pricing_rule_accepted_version) values
('12000000-0000-4000-8400-000000000001','active',150,8900,14900,now(),'test'),
('12000000-0000-4000-8400-000000000003','active',150,8900,14900,now(),'test');

set local role authenticated;
select set_config('request.jwt.claim.sub','12000000-0000-4000-8400-000000000004',true);
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8400-000000000004","email":"daily-1b3-noaccess@example.invalid","role":"authenticated"}',true);
select throws_ok($$select * from public.daily_client_bootstrap_organisation('No Access OF','92000000000001',null,null)$$,'P0001',null,'bootstrap requires active Daily access');

select set_config('request.jwt.claim.sub','12000000-0000-4000-8400-000000000001',true);
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8400-000000000001","email":"daily-1b3-manager@example.invalid","role":"authenticated"}',true);
select * from public.daily_client_bootstrap_organisation('Daily 1B3 Test OF','92000000000002','1 rue Test','Manager Test');
select is((select count(*)::int from public.organisation_memberships where user_id='12000000-0000-4000-8400-000000000001' and status='active'),1,'bootstrap creates one active membership');
select is((select count(*)::int from public.organisation_membership_roles r join public.organisation_memberships m on m.id=r.membership_id where m.user_id='12000000-0000-4000-8400-000000000001' and r.role='manager'),1,'bootstrap grants manager role');
select is((select count(*)::int from public.organisation_membership_permission_blocks b join public.organisation_memberships m on m.id=b.membership_id where m.user_id='12000000-0000-4000-8400-000000000001' and b.enabled=true and b.revoked_at is null and b.permission_block in ('users','trainers','legal_profile','permanent_documents')),4,'bootstrap grants four permission blocks');
select is((public.daily_client_workspace(null)->'organisation'->>'name'),'Daily 1B3 Test OF','workspace exposes manager organisation');
select isnt_empty($$select 1 where (public.daily_client_workspace(null)->'capabilities'->>'users')::boolean and (public.daily_client_workspace(null)->'capabilities'->>'trainers')::boolean and (public.daily_client_workspace(null)->'capabilities'->>'legal_profile')::boolean$$,'manager workspace exposes expected capabilities');
select * from public.daily_client_bootstrap_organisation('Ignored duplicate','92000000000999',null,null);
select is((select count(*)::int from public.organisation_memberships where user_id='12000000-0000-4000-8400-000000000001'),1,'second bootstrap does not duplicate membership');

reset role;
select is((select count(*)::int from public.daily_organisation_checklist_items where organisation_id=(select organisation_id from public.organisation_memberships where user_id='12000000-0000-4000-8400-000000000001')),7,'new Daily organisation receives Studio checklist');
insert into public.organisations(id,name,siret,status) values('12000000-0000-4000-8400-000000000020','Already Known OF','92000000000003','active');
set local role authenticated;
select set_config('request.jwt.claim.sub','12000000-0000-4000-8400-000000000003',true);
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8400-000000000003","email":"daily-1b3-other@example.invalid","role":"authenticated"}',true);
select throws_ok($$select * from public.daily_client_bootstrap_organisation('Claim Attempt','92000000000003',null,null)$$,'P0001',null,'existing SIRET cannot be self-claimed');

reset role;
create temporary table tmp_org as select organisation_id from public.organisation_memberships where user_id='12000000-0000-4000-8400-000000000001' limit 1;
insert into public.organisation_memberships(id,organisation_id,user_id,status,primary_role) select '12000000-0000-4000-8400-000000000030',organisation_id,'12000000-0000-4000-8400-000000000002','active','trainer' from tmp_org;
insert into public.organisation_membership_roles(membership_id,role) values('12000000-0000-4000-8400-000000000030','trainer');
insert into public.daily_trainer_profiles(id,organisation_id,membership_id,user_id,professional_email,display_name,status,engagement_type) select '12000000-0000-4000-8400-000000000040',organisation_id,'12000000-0000-4000-8400-000000000030','12000000-0000-4000-8400-000000000002','trainer@example.invalid','Trainer Self','draft','external' from tmp_org;
insert into public.daily_trainer_profiles(id,organisation_id,professional_email,display_name,status,engagement_type) select '12000000-0000-4000-8400-000000000041',organisation_id,'othertrainer@example.invalid','Other Trainer','draft','external' from tmp_org;

set local role authenticated;
select set_config('request.jwt.claim.sub','12000000-0000-4000-8400-000000000002',true);
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8400-000000000002","email":"daily-1b3-trainer@example.invalid","role":"authenticated"}',true);
select is(jsonb_array_length(public.daily_client_workspace(null)->'trainers'),1,'trainer sees only own trainer profile');
select is((public.daily_client_workspace(null)->'trainers'->0->>'display_name'),'Trainer Self','trainer workspace returns own profile');
select is((public.daily_client_workspace(null)->'capabilities'->>'trainers')::boolean,false,'trainer without trainers block cannot manage all trainers');
select is((public.daily_client_workspace(null)->'capabilities'->>'trainer_self')::boolean,true,'trainer self-service capability is explicit');
select is(jsonb_array_length(public.daily_client_workspace(null)->'users'),0,'trainer without users block cannot list users');
select lives_ok($$update public.daily_trainer_profiles set biography='Profil formateur' where id='12000000-0000-4000-8400-000000000040'$$,'trainer can update own unvalidated profile');

select set_config('request.jwt.claim.sub','12000000-0000-4000-8400-000000000001',true);
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8400-000000000001","email":"daily-1b3-manager@example.invalid","role":"authenticated"}',true);
select lives_ok($$select public.daily_client_set_membership_access((select organisation_id from tmp_org),'12000000-0000-4000-8400-000000000030',array['trainer','admin_assistant'],array['trainers'])$$,'manager can update non-manager access');
select throws_ok($$select public.daily_client_set_membership_access((select organisation_id from tmp_org),'12000000-0000-4000-8400-000000000030',array['manager'],array[]::text[])$$,'P0001',null,'manager cannot grant manager role');
select lives_ok($$select public.daily_client_set_membership_status((select organisation_id from tmp_org),'12000000-0000-4000-8400-000000000030','disabled')$$,'manager can disable non-manager user');
select lives_ok($$select public.daily_client_set_membership_status((select organisation_id from tmp_org),'12000000-0000-4000-8400-000000000030','active')$$,'manager can reactivate non-manager user');
select throws_ok($$select public.daily_client_set_membership_status((select organisation_id from tmp_org),(select id from public.organisation_memberships where user_id='12000000-0000-4000-8400-000000000001'),'disabled')$$,'P0001',null,'manager cannot disable self');

select * from finish();
rollback;
