-- Selen Daily Lot 1B.4 - organisation ownership and V0 bridge regression coverage.
-- All synthetic data is rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('17000000-0000-4000-8400-000000000001','authenticated','authenticated','lot1b4-a@example.invalid','x',now(),now(),now()),
('17000000-0000-4000-8400-000000000002','authenticated','authenticated','lot1b4-b@example.invalid','x',now(),now(),now());

insert into public.organisations(id,name,status) values
('17000000-0000-4000-8400-000000000010','Lot1B4 Org A','active'),
('17000000-0000-4000-8400-000000000020','Lot1B4 Org B','active');

insert into public.organisation_memberships(id,organisation_id,user_id,status,primary_role,joined_at,created_by,updated_by) values
('17000000-0000-4000-8400-000000000011','17000000-0000-4000-8400-000000000010','17000000-0000-4000-8400-000000000001','active','admin_assistant',now(),'17000000-0000-4000-8400-000000000001','17000000-0000-4000-8400-000000000001'),
('17000000-0000-4000-8400-000000000021','17000000-0000-4000-8400-000000000020','17000000-0000-4000-8400-000000000002','active','manager',now(),'17000000-0000-4000-8400-000000000002','17000000-0000-4000-8400-000000000002');

insert into public.organisation_membership_roles(membership_id,role,created_by) values
('17000000-0000-4000-8400-000000000011','admin_assistant','17000000-0000-4000-8400-000000000001'),
('17000000-0000-4000-8400-000000000021','manager','17000000-0000-4000-8400-000000000002');

insert into public.organisation_membership_permission_blocks(membership_id,permission_block,enabled,granted_by,granted_at)
values('17000000-0000-4000-8400-000000000011','trainings',true,'17000000-0000-4000-8400-000000000001',now());

select is((select count(*)::int from public.organisation_membership_permission_blocks where membership_id='17000000-0000-4000-8400-000000000021' and permission_block in ('trainings','sessions') and enabled=true and revoked_at is null),2,'manager role automatically owns delegable training/session blocks');

set local role authenticated;
select set_config('request.jwt.claim.sub','17000000-0000-4000-8400-000000000001',true);
select set_config('request.jwt.claims','{"sub":"17000000-0000-4000-8400-000000000001","email":"lot1b4-a@example.invalid","role":"authenticated"}',true);

select ok(public.can_manage_daily_trainings('17000000-0000-4000-8400-000000000010'),'assistant with trainings block can manage trainings');
select ok(not public.can_manage_daily_sessions('17000000-0000-4000-8400-000000000010'),'assistant without sessions block cannot manage sessions');

select lives_ok($$insert into public.daily_formations(
 id,user_id,title,global_objective,target_audience,prerequisites,duration_hours,duration_days,modality,modality_details,access_delays,registration_methods,price,detailed_program,accessibility,pedagogical_resources,evaluation_methods,contact_phone,contact_email,status
) values (
 '17000000-0000-4000-8400-000000000030','17000000-0000-4000-8400-000000000001','Formation A','Objectif','Public','Aucun',7,1,'presentiel','Sur site','7 jours','Email','100','Programme','Accessible','Supports','Quiz','0100000000','a@example.invalid','draft'
)$$,'legacy formation write without organisation_id is bridged');
select is((select organisation_id::text from public.daily_formations where id='17000000-0000-4000-8400-000000000030'),'17000000-0000-4000-8400-000000000010','bridge assigns active organisation to formation');
select is((select count(*)::int from public.daily_formations where organisation_id='17000000-0000-4000-8400-000000000020'),0,'assistant sees no other organisation formation');

select throws_ok($$insert into public.daily_sessions(id,user_id,formation_id,modality,schedule_blocks,companies,beneficiaries,individual_beneficiaries,status,trainer_ids,start_date,end_date)
values('17000000-0000-4000-8400-000000000031','17000000-0000-4000-8400-000000000001','17000000-0000-4000-8400-000000000030','presentiel','[{"date":"2026-09-01","start":"09:00","end":"17:00"}]','[]','[]','[]','ready','[]','2026-09-01','2026-09-01')$$,'42501',null,'assistant without sessions block cannot create session');

reset role;
insert into public.organisation_membership_permission_blocks(membership_id,permission_block,enabled,granted_by,granted_at)
values('17000000-0000-4000-8400-000000000011','sessions',true,'17000000-0000-4000-8400-000000000001',now())
on conflict on constraint organisation_membership_permission_blocks_unique do update set enabled=true,revoked_at=null;

set local role authenticated;
select set_config('request.jwt.claim.sub','17000000-0000-4000-8400-000000000001',true);
select set_config('request.jwt.claims','{"sub":"17000000-0000-4000-8400-000000000001","email":"lot1b4-a@example.invalid","role":"authenticated"}',true);
select ok(public.can_manage_daily_sessions('17000000-0000-4000-8400-000000000010'),'sessions block enables session management');
select lives_ok($$insert into public.daily_sessions(id,user_id,formation_id,modality,schedule_blocks,companies,beneficiaries,individual_beneficiaries,status,trainer_ids,start_date,end_date)
values('17000000-0000-4000-8400-000000000031','17000000-0000-4000-8400-000000000001','17000000-0000-4000-8400-000000000030','presentiel','[{"date":"2026-09-01","start":"09:00","end":"17:00"}]','[]','[]','[]','ready','[]','2026-09-01','2026-09-01')$$,'legacy session write without organisation_id is bridged');
select is((select organisation_id::text from public.daily_sessions where id='17000000-0000-4000-8400-000000000031'),'17000000-0000-4000-8400-000000000010','bridge assigns formation organisation to session');
select is((select count(*)::int from public.daily_sessions where organisation_id='17000000-0000-4000-8400-000000000010'),1,'assistant reads own organisation session');

select set_config('request.jwt.claim.sub','17000000-0000-4000-8400-000000000002',true);
select set_config('request.jwt.claims','{"sub":"17000000-0000-4000-8400-000000000002","email":"lot1b4-b@example.invalid","role":"authenticated"}',true);
select is((select count(*)::int from public.daily_formations where id='17000000-0000-4000-8400-000000000030'),0,'other organisation manager cannot read Org A formation');
select is((select count(*)::int from public.daily_sessions where id='17000000-0000-4000-8400-000000000031'),0,'other organisation manager cannot read Org A session');
select throws_ok($$insert into public.daily_sessions(id,user_id,organisation_id,formation_id,modality,schedule_blocks,companies,beneficiaries,individual_beneficiaries,status,trainer_ids,start_date,end_date)
values('17000000-0000-4000-8400-000000000032','17000000-0000-4000-8400-000000000002','17000000-0000-4000-8400-000000000020','17000000-0000-4000-8400-000000000030','presentiel','[{"date":"2026-09-02","start":"09:00","end":"17:00"}]','[]','[]','[]','ready','[]','2026-09-02','2026-09-02')$$,'P0001',null,'bridge refuses session pointing to another organisation formation');

select * from finish();
rollback;
