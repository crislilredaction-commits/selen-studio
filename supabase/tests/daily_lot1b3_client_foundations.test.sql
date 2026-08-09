-- Selen Daily Lot 1B.3 - transactional client workspace regression coverage.
-- Covers bootstrap, invitation acceptance, client permission boundaries and trainer self-service.
-- All synthetic data is rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('16000000-0000-4000-8400-000000000001','authenticated','authenticated','daily-1b3-manager@example.invalid','x',now(),now(),now()),
('16000000-0000-4000-8400-000000000002','authenticated','authenticated','daily-1b3-trainer@example.invalid','x',now(),now(),now()),
('16000000-0000-4000-8400-000000000003','authenticated','authenticated','daily-1b3-noaccess@example.invalid','x',now(),now(),now()),
('16000000-0000-4000-8400-000000000004','authenticated','authenticated','daily-1b3-claim@example.invalid','x',now(),now(),now());

insert into public.daily_subscriptions(user_id,status,annual_learner_limit,base_monthly_amount_cents,upper_monthly_amount_cents,pricing_rule_accepted_at,pricing_rule_accepted_version) values
('16000000-0000-4000-8400-000000000001','active',150,8900,14900,now(),'test'),
('16000000-0000-4000-8400-000000000004','active',150,8900,14900,now(),'test');

set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8400-000000000003',true);
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8400-000000000003","email":"daily-1b3-noaccess@example.invalid","role":"authenticated"}',true);
select throws_ok($$select * from public.daily_client_bootstrap_organisation('No Access','96000000000001',null,null)$$,'P0001',null,'bootstrap refuses user without active Daily access');

select set_config('request.jwt.claim.sub','16000000-0000-4000-8400-000000000001',true);
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8400-000000000001","email":"daily-1b3-manager@example.invalid","role":"authenticated"}',true);
select * from public.daily_client_bootstrap_organisation('Daily 1B3 Regression OF','96000000000002','1 rue Test','Manager Test');
select is((select count(*)::int from public.organisation_membership_roles r join public.organisation_memberships m on m.id=r.membership_id where m.user_id='16000000-0000-4000-8400-000000000001' and r.role='manager'),1,'bootstrap creates first manager');
select is((select count(*)::int from public.organisation_membership_permission_blocks b join public.organisation_memberships m on m.id=b.membership_id where m.user_id='16000000-0000-4000-8400-000000000001' and b.enabled=true and b.revoked_at is null),4,'bootstrap grants four initial permission blocks');
select is((public.daily_client_workspace(null)->'organisation'->>'name'),'Daily 1B3 Regression OF','manager workspace resolves own organisation');
select lives_ok($$select public.daily_client_update_safe_organisation((select organisation_id from public.organisation_memberships where user_id='16000000-0000-4000-8400-000000000001'),'contact@daily.invalid','0102030405','2 rue Test')$$,'legal profile holder can update safe contact fields');
select lives_ok($$select public.daily_create_organisation_invitation((select organisation_id from public.organisation_memberships where user_id='16000000-0000-4000-8400-000000000001'),'daily-1b3-trainer@example.invalid',array['trainer'],array[]::text[],encode(digest('regression-raw-token','sha256'),'hex'))$$,'manager can create trainer invitation');
select is((select count(*)::int from public.daily_organisation_invitations where invited_email='daily-1b3-trainer@example.invalid' and token_hash='regression-raw-token'),0,'raw invitation token is never stored');

select set_config('request.jwt.claim.sub','16000000-0000-4000-8400-000000000002',true);
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8400-000000000002","email":"daily-1b3-trainer@example.invalid","role":"authenticated"}',true);
select lives_ok($$select * from public.daily_accept_organisation_invitation(encode(digest('regression-raw-token','sha256'),'hex'))$$,'matching invited user can accept invitation');
select is((select count(*)::int from public.organisation_membership_roles r join public.organisation_memberships m on m.id=r.membership_id where m.user_id='16000000-0000-4000-8400-000000000002' and r.role='trainer'),1,'invitation grants trainer role');

reset role;
insert into public.daily_trainer_profiles(id,organisation_id,membership_id,user_id,professional_email,display_name,status,engagement_type)
select '16000000-0000-4000-8400-000000000040',m.organisation_id,m.id,m.user_id,'daily-1b3-trainer@example.invalid','Trainer Self','draft','external'
from public.organisation_memberships m where m.user_id='16000000-0000-4000-8400-000000000002';
insert into public.daily_trainer_profiles(id,organisation_id,professional_email,display_name,status,engagement_type)
select '16000000-0000-4000-8400-000000000041',m.organisation_id,'other@example.invalid','Other Trainer','draft','external'
from public.organisation_memberships m where m.user_id='16000000-0000-4000-8400-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8400-000000000002',true);
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8400-000000000002","email":"daily-1b3-trainer@example.invalid","role":"authenticated"}',true);
select is(jsonb_array_length(public.daily_client_workspace(null)->'trainers'),1,'simple trainer sees only own trainer profile');
select is(jsonb_array_length(public.daily_client_workspace(null)->'users'),0,'simple trainer cannot enumerate organisation users');
select lives_ok($$update public.daily_trainer_profiles set biography='Own profile update' where id='16000000-0000-4000-8400-000000000040'$$,'trainer can update own unvalidated profile');

select set_config('request.jwt.claim.sub','16000000-0000-4000-8400-000000000001',true);
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8400-000000000001","email":"daily-1b3-manager@example.invalid","role":"authenticated"}',true);
select throws_ok($$select public.daily_client_set_membership_access((select organisation_id from public.organisation_memberships where user_id='16000000-0000-4000-8400-000000000001'),(select id from public.organisation_memberships where user_id='16000000-0000-4000-8400-000000000002'),array['manager'],array[]::text[])$$,'P0001',null,'client manager cannot grant manager role');
select throws_ok($$select public.daily_client_set_membership_status((select organisation_id from public.organisation_memberships where user_id='16000000-0000-4000-8400-000000000001'),(select id from public.organisation_memberships where user_id='16000000-0000-4000-8400-000000000001'),'disabled')$$,'P0001',null,'client manager cannot disable self');

reset role;
insert into public.organisations(id,name,siret,status) values('16000000-0000-4000-8400-000000000050','Existing SIRET','96000000000004','active');
set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8400-000000000004',true);
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8400-000000000004","email":"daily-1b3-claim@example.invalid","role":"authenticated"}',true);
select throws_ok($$select * from public.daily_client_bootstrap_organisation('Claim attempt','96000000000004',null,null)$$,'P0001',null,'existing SIRET cannot be self-claimed');

select * from finish();
rollback;
