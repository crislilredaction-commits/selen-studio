begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('19000000-0000-4000-8400-000000000001','authenticated','authenticated','lot2c-client@example.invalid','x',now(),now(),now()),
('19000000-0000-4000-8400-000000000002','authenticated','authenticated','lot2c-agent@example.invalid','x',now(),now(),now());
insert into public.agent_profiles(id,user_id,email,role,is_active,first_name,last_name) values
('19000000-0000-4000-8400-000000000010','19000000-0000-4000-8400-000000000002','lot2c-agent@example.invalid','agent',true,'Agent','2C');
insert into public.organisations(id,name,siret,status) values('19000000-0000-4000-8400-000000000020','Lot2C OF','98000000000001','active');
insert into public.organisation_memberships(id,organisation_id,user_id,status,primary_role,joined_at) values('19000000-0000-4000-8400-000000000021','19000000-0000-4000-8400-000000000020','19000000-0000-4000-8400-000000000001','active','manager',now());
insert into public.organisation_membership_roles(membership_id,role) values('19000000-0000-4000-8400-000000000021','manager');
insert into public.daily_organisation_assignments(organisation_id,agent_profile_id,assigned_by) values('19000000-0000-4000-8400-000000000020','19000000-0000-4000-8400-000000000010','19000000-0000-4000-8400-000000000001');
insert into public.daily_formations(id,user_id,organisation_id,title,global_objective,learning_objectives,target_audience,prerequisites,duration_hours,duration_days,modality,modality_details,access_delays,registration_methods,price,detailed_program,accessibility,pedagogical_methods,pedagogical_resources,evaluation_methods,results_pending,contact_phone,contact_email,status)
values('19000000-0000-4000-8400-000000000030','19000000-0000-4000-8400-000000000001','19000000-0000-4000-8400-000000000020','Formation 2C','Objectif','["Objectif 1"]'::jsonb,'Public','Aucun',7,1,'presentiel','Salle','7 jours','Selen','500 €','Programme','Accessible','Méthode','Supports','Quiz',true,'0102030405','contact@example.invalid','draft');
insert into public.daily_sessions(id,user_id,organisation_id,formation_id,internal_reference,max_participants,modality,start_date,end_date,schedule_blocks,location_address,companies,beneficiaries,individual_beneficiaries,trainer_ids,status)
values('19000000-0000-4000-8400-000000000040','19000000-0000-4000-8400-000000000001','19000000-0000-4000-8400-000000000020','19000000-0000-4000-8400-000000000030','SES-2C',10,'presentiel','2026-09-20','2026-09-20','[{"date":"2026-09-20","start":"09:00","end":"17:00"}]'::jsonb,'1 rue Test','[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'draft');

select is((select count(*)::int from public.daily_session_dossiers where session_id='19000000-0000-4000-8400-000000000040'),1,'session automatically creates one dossier');
select is((select count(*)::int from public.daily_session_checklist_items where session_id='19000000-0000-4000-8400-000000000040'),9,'session dossier seeds nine checklist items');
select is((select assigned_agent_profile_id from public.daily_session_dossiers where session_id='19000000-0000-4000-8400-000000000040'),'19000000-0000-4000-8400-000000000010'::uuid,'dossier inherits organisation agent');
select is((select count(*)::int from public.notifications where source_kind='daily_session_checklist' and target_agent_profile_id='19000000-0000-4000-8400-000000000010'),9,'checklist notifications target assigned agent');
select ok((select bool_and(escalation_at=created_at+interval '72 hours') from public.notifications where source_kind='daily_session_checklist'),'notifications escalate after 72 hours');
select is((select count(*)::int from public.daily_session_checklist_items where session_id='19000000-0000-4000-8400-000000000040' and phase='before'),5,'before phase contains five items');
select is((select count(*)::int from public.daily_session_checklist_items where session_id='19000000-0000-4000-8400-000000000040' and responsibility='selen'),1,'one internal Selen closure item exists');
update public.daily_session_checklist_items set status='validated' where session_id='19000000-0000-4000-8400-000000000040' and item_key='training_ready';
select ok((select dismissed_at is not null from public.notifications n join public.daily_session_checklist_items i on n.source_key='daily_session_checklist:'||i.id::text where i.item_key='training_ready'),'validated item dismisses notification');
update public.daily_session_checklist_items set status='todo' where session_id='19000000-0000-4000-8400-000000000040' and item_key='training_ready';
select ok((select dismissed_at is null and read_at is null from public.notifications n join public.daily_session_checklist_items i on n.source_key='daily_session_checklist:'||i.id::text where i.item_key='training_ready'),'reopened item reactivates notification');
update public.daily_session_dossiers set assigned_agent_profile_id=null where session_id='19000000-0000-4000-8400-000000000040';
select is((select count(*)::int from public.notifications where source_kind='daily_session_checklist' and dismissed_at is null and target_role='admin'),9,'unassigned dossier routes active notifications to admins');
set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8400-000000000001',true);
select set_config('request.jwt.claims','{"sub":"19000000-0000-4000-8400-000000000001","email":"lot2c-client@example.invalid","role":"authenticated"}',true);
select is((select count(*)::int from public.daily_session_dossiers where session_id='19000000-0000-4000-8400-000000000040'),1,'client can read own session dossier');
select is((select count(*)::int from public.daily_session_checklist_items where session_id='19000000-0000-4000-8400-000000000040'),8,'client cannot see Selen-only item');
update public.daily_session_checklist_items set status='in_progress' where session_id='19000000-0000-4000-8400-000000000040' and item_key='schedule_location';
select is((select status from public.daily_session_checklist_items where session_id='19000000-0000-4000-8400-000000000040' and item_key='schedule_location'),'in_progress','client can progress visible checklist item');
select * from finish();
rollback;
