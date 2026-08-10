begin;
create extension if not exists pgtap with schema extensions;
select plan(12);
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('20000000-0000-4000-8400-000000000001','authenticated','authenticated','lot2d-manager@example.invalid','x',now(),now(),now()),
('20000000-0000-4000-8400-000000000002','authenticated','authenticated','lot2d-other@example.invalid','x',now(),now(),now());
insert into public.organisations(id,name,siret,status) values('20000000-0000-4000-8400-000000000010','Lot2D OF A','99000000000001','active'),('20000000-0000-4000-8400-000000000011','Lot2D OF B','99000000000002','active');
insert into public.organisation_memberships(id,organisation_id,user_id,status,primary_role,joined_at) values('20000000-0000-4000-8400-000000000020','20000000-0000-4000-8400-000000000010','20000000-0000-4000-8400-000000000001','active','manager',now()),('20000000-0000-4000-8400-000000000021','20000000-0000-4000-8400-000000000011','20000000-0000-4000-8400-000000000002','active','manager',now());
insert into public.organisation_membership_roles(membership_id,role) values('20000000-0000-4000-8400-000000000020','manager'),('20000000-0000-4000-8400-000000000021','manager');
insert into public.daily_formations(id,user_id,organisation_id,title,global_objective,learning_objectives,target_audience,prerequisites,duration_hours,duration_days,modality,modality_details,access_delays,registration_methods,price,detailed_program,accessibility,pedagogical_methods,pedagogical_resources,evaluation_methods,results_pending,contact_phone,contact_email,status) values
('20000000-0000-4000-8400-000000000030','20000000-0000-4000-8400-000000000001','20000000-0000-4000-8400-000000000010','Formation A','Objectif','["Objectif"]','Public','Aucun',7,1,'presentiel','Salle','7 jours','Selen','500','Programme','Accessible','Méthode','Supports','Quiz',true,'0102030405','a@example.invalid','draft'),
('20000000-0000-4000-8400-000000000031','20000000-0000-4000-8400-000000000002','20000000-0000-4000-8400-000000000011','Formation B','Objectif','["Objectif"]','Public','Aucun',7,1,'presentiel','Salle','7 jours','Selen','500','Programme','Accessible','Méthode','Supports','Quiz',true,'0102030405','b@example.invalid','draft');
insert into public.daily_sessions(id,user_id,organisation_id,formation_id,internal_reference,max_participants,modality,start_date,end_date,schedule_blocks,location_address,companies,beneficiaries,individual_beneficiaries,trainer_ids,status) values
('20000000-0000-4000-8400-000000000040','20000000-0000-4000-8400-000000000001','20000000-0000-4000-8400-000000000010','20000000-0000-4000-8400-000000000030','SES-2D',1,'presentiel','2026-09-20','2026-09-20','[{"date":"2026-09-20","start":"09:00","end":"17:00"}]','1 rue Test','[]','[]','[]','[]','draft'),
('20000000-0000-4000-8400-000000000041','20000000-0000-4000-8400-000000000002','20000000-0000-4000-8400-000000000011','20000000-0000-4000-8400-000000000031','SES-2D-B',10,'presentiel','2026-09-21','2026-09-21','[{"date":"2026-09-21","start":"09:00","end":"17:00"}]','2 rue Test','[]','[]','[]','[]','draft');
insert into public.daily_learners(id,organisation_id,first_name,last_name,email,created_by) values
('20000000-0000-4000-8400-000000000050','20000000-0000-4000-8400-000000000010','Alice','Martin','alice@example.invalid','20000000-0000-4000-8400-000000000001'),
('20000000-0000-4000-8400-000000000051','20000000-0000-4000-8400-000000000011','Bob','Durand','bob@example.invalid','20000000-0000-4000-8400-000000000002'),
('20000000-0000-4000-8400-000000000052','20000000-0000-4000-8400-000000000010','Claire','Petit','claire@example.invalid','20000000-0000-4000-8400-000000000001');
insert into public.daily_session_enrolments(id,organisation_id,session_id,learner_id,status,funding_type,created_by) values('20000000-0000-4000-8400-000000000060','20000000-0000-4000-8400-000000000010','20000000-0000-4000-8400-000000000040','20000000-0000-4000-8400-000000000050','pending','employer','20000000-0000-4000-8400-000000000001');
select is((select status from public.daily_session_checklist_items where session_id='20000000-0000-4000-8400-000000000040' and item_key='participants_ready'),'in_progress','pending enrolment moves participant checklist to in progress');
update public.daily_session_enrolments set status='confirmed' where id='20000000-0000-4000-8400-000000000060';
select is((select status from public.daily_session_checklist_items where session_id='20000000-0000-4000-8400-000000000040' and item_key='participants_ready'),'to_review','confirmed enrolments move participant checklist to review');
select throws_ok($$insert into public.daily_session_enrolments(organisation_id,session_id,learner_id,status) values('20000000-0000-4000-8400-000000000010','20000000-0000-4000-8400-000000000040','20000000-0000-4000-8400-000000000052','pending')$$,'P0001','Daily session participant capacity reached','capacity guard refuses extra active learner');
select throws_ok($$insert into public.daily_session_enrolments(organisation_id,session_id,learner_id,status) values('20000000-0000-4000-8400-000000000010','20000000-0000-4000-8400-000000000040','20000000-0000-4000-8400-000000000051','cancelled')$$,'P0001','Daily enrolment organisation mismatch','cross organisation learner is refused');
insert into public.daily_enrolment_support_needs(enrolment_id,organisation_id,has_specific_needs,needs_description,planned_accommodations,contact_requested) values('20000000-0000-4000-8400-000000000060','20000000-0000-4000-8400-000000000010',true,'Besoin d’un support agrandi','Documents agrandis',true);
select ok((select has_specific_needs and contact_requested from public.daily_enrolment_support_needs where enrolment_id='20000000-0000-4000-8400-000000000060'),'support needs are stored separately from learner identity');
select throws_ok($$update public.daily_enrolment_support_needs set organisation_id='20000000-0000-4000-8400-000000000011' where enrolment_id='20000000-0000-4000-8400-000000000060'$$,'P0001','Daily support need organisation mismatch','support needs cannot move across organisations');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8400-000000000001',true);
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8400-000000000001","email":"lot2d-manager@example.invalid","role":"authenticated"}',true);
select is((select count(*)::int from public.daily_learners),2,'manager sees only learners from own organisation');
select is((select count(*)::int from public.daily_session_enrolments),1,'manager sees only enrolments from own organisation');
select is((select count(*)::int from public.daily_enrolment_support_needs),1,'manager sees support needs for own organisation');
select lives_ok($$update public.daily_session_enrolments set positioning_status='submitted',prerequisites_status='to_clarify' where id='20000000-0000-4000-8400-000000000060'$$,'manager can progress positioning and prerequisites');
select is((select positioning_status from public.daily_session_enrolments where id='20000000-0000-4000-8400-000000000060'),'submitted','positioning status persisted');
select is((select prerequisites_status from public.daily_session_enrolments where id='20000000-0000-4000-8400-000000000060'),'to_clarify','prerequisites status persisted');
select * from finish();
rollback;
