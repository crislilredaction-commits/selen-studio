begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('21000000-0000-4000-8400-000000000001','authenticated','authenticated','lot2e-manager@example.invalid','x',now(),now(),now()),
('21000000-0000-4000-8400-000000000002','authenticated','authenticated','lot2e-other@example.invalid','x',now(),now(),now());
insert into public.organisations(id,name,siret,status) values
('21000000-0000-4000-8400-000000000010','Lot2E OF A','99100000000001','active'),
('21000000-0000-4000-8400-000000000011','Lot2E OF B','99100000000002','active');
insert into public.organisation_memberships(id,organisation_id,user_id,status,primary_role,joined_at) values
('21000000-0000-4000-8400-000000000020','21000000-0000-4000-8400-000000000010','21000000-0000-4000-8400-000000000001','active','manager',now()),
('21000000-0000-4000-8400-000000000021','21000000-0000-4000-8400-000000000011','21000000-0000-4000-8400-000000000002','active','manager',now());
insert into public.organisation_membership_roles(membership_id,role) values
('21000000-0000-4000-8400-000000000020','manager'),('21000000-0000-4000-8400-000000000021','manager');
insert into public.daily_formations(id,user_id,organisation_id,title,global_objective,learning_objectives,target_audience,prerequisites,duration_hours,duration_days,modality,modality_details,access_delays,registration_methods,price,detailed_program,accessibility,pedagogical_methods,pedagogical_resources,evaluation_methods,results_pending,contact_phone,contact_email,status) values
('21000000-0000-4000-8400-000000000030','21000000-0000-4000-8400-000000000001','21000000-0000-4000-8400-000000000010','Formation 2E','Objectif','["Objectif"]','Public','Aucun',7,1,'presentiel','Salle','7 jours','Selen','500','Programme','Accessible','Méthode','Supports','Quiz',true,'0102030405','a@example.invalid','draft'),
('21000000-0000-4000-8400-000000000031','21000000-0000-4000-8400-000000000002','21000000-0000-4000-8400-000000000011','Formation B','Objectif','["Objectif"]','Public','Aucun',7,1,'presentiel','Salle','7 jours','Selen','500','Programme','Accessible','Méthode','Supports','Quiz',true,'0102030405','b@example.invalid','draft');
insert into public.daily_sessions(id,user_id,organisation_id,formation_id,internal_reference,max_participants,modality,start_date,end_date,schedule_blocks,location_address,companies,beneficiaries,individual_beneficiaries,trainer_ids,status) values
('21000000-0000-4000-8400-000000000040','21000000-0000-4000-8400-000000000001','21000000-0000-4000-8400-000000000010','21000000-0000-4000-8400-000000000030','SES-2E',10,'presentiel','2026-10-01','2026-10-01','[{"date":"2026-10-01","start":"09:00","end":"17:00"}]','1 rue Test','[]','[]','[]','[]','draft'),
('21000000-0000-4000-8400-000000000041','21000000-0000-4000-8400-000000000002','21000000-0000-4000-8400-000000000011','21000000-0000-4000-8400-000000000031','SES-B',10,'presentiel','2026-10-02','2026-10-02','[{"date":"2026-10-02","start":"09:00","end":"17:00"}]','2 rue Test','[]','[]','[]','[]','draft');
insert into public.daily_learners(id,organisation_id,first_name,last_name,email,created_by) values
('21000000-0000-4000-8400-000000000050','21000000-0000-4000-8400-000000000010','Alice','Martin','alice-2e@example.invalid','21000000-0000-4000-8400-000000000001');
insert into public.daily_session_enrolments(id,organisation_id,session_id,learner_id,status,created_by) values
('21000000-0000-4000-8400-000000000060','21000000-0000-4000-8400-000000000010','21000000-0000-4000-8400-000000000040','21000000-0000-4000-8400-000000000050','confirmed','21000000-0000-4000-8400-000000000001');

select is((select status from public.daily_session_checklist_items where session_id='21000000-0000-4000-8400-000000000040' and item_key='pretraining_documents'),'todo','pretraining checklist starts todo');
select is((select note from public.daily_session_checklist_items where session_id='21000000-0000-4000-8400-000000000040' and item_key='pretraining_documents'),'0/4 document(s) préformation préparé(s).','one active enrolment makes four documents expected');

insert into public.daily_documents(organisation_id,document_type,linked_object_type,linked_object_id,version,status,logical_name,bucket,storage_path,is_current) values
('21000000-0000-4000-8400-000000000010','training_program','session','21000000-0000-4000-8400-000000000040',1,'to_check','programme-session','documents','tests/2e/programme.doc',true);
select is((select status from public.daily_session_checklist_items where session_id='21000000-0000-4000-8400-000000000040' and item_key='pretraining_documents'),'in_progress','partial document set moves checklist in progress');
select throws_ok($$insert into public.daily_documents(organisation_id,document_type,linked_object_type,linked_object_id,version,status,logical_name,bucket,storage_path,is_current) values('21000000-0000-4000-8400-000000000011','training_agreement','session','21000000-0000-4000-8400-000000000040',1,'to_check','bad-scope','documents','tests/2e/bad.doc',true)$$,'P0001','Daily pretraining document organisation mismatch','cross organisation document is refused');
select throws_ok($$insert into public.daily_documents(organisation_id,document_type,linked_object_type,linked_object_id,version,status,logical_name,bucket,storage_path,is_current) values('21000000-0000-4000-8400-000000000010','convocation','session','21000000-0000-4000-8400-000000000040',1,'to_check','bad-link','documents','tests/2e/bad-link.doc',true)$$,'P0001','Daily learner pretraining document must link to an enrolment','convocation must link to enrolment');

insert into public.daily_documents(organisation_id,document_type,linked_object_type,linked_object_id,version,status,logical_name,bucket,storage_path,is_current) values
('21000000-0000-4000-8400-000000000010','training_agreement','session','21000000-0000-4000-8400-000000000040',1,'to_check','convention-session','documents','tests/2e/convention.doc',true),
('21000000-0000-4000-8400-000000000010','convocation','enrolment','21000000-0000-4000-8400-000000000060',1,'to_check','convocation-apprenant','documents','tests/2e/convocation.doc',true),
('21000000-0000-4000-8400-000000000010','registration_positioning','enrolment','21000000-0000-4000-8400-000000000060',1,'to_check','inscription-positionnement','documents','tests/2e/positionnement.doc',true);
select is((select status from public.daily_session_checklist_items where session_id='21000000-0000-4000-8400-000000000040' and item_key='pretraining_documents'),'to_review','complete generated set moves checklist to review');
select is((select note from public.daily_session_checklist_items where session_id='21000000-0000-4000-8400-000000000040' and item_key='pretraining_documents'),'4/4 document(s) préformation préparé(s).','checklist reports complete generated set');

update public.daily_documents set status='validated' where organisation_id='21000000-0000-4000-8400-000000000010' and storage_path like 'tests/2e/%';
select is((select status from public.daily_session_checklist_items where session_id='21000000-0000-4000-8400-000000000040' and item_key='pretraining_documents'),'validated','validated document set validates checklist');
select is((select note from public.daily_session_checklist_items where session_id='21000000-0000-4000-8400-000000000040' and item_key='pretraining_documents'),'4 document(s) préformation validé(s).','validated checklist reports validated count');

update public.daily_session_enrolments set status='cancelled' where id='21000000-0000-4000-8400-000000000060';
select is((select note from public.daily_session_checklist_items where session_id='21000000-0000-4000-8400-000000000040' and item_key='pretraining_documents'),'2 document(s) préformation validé(s).','cancelled enrolment removes learner documents from expected set');
select is((select status from public.daily_session_checklist_items where session_id='21000000-0000-4000-8400-000000000040' and item_key='pretraining_documents'),'validated','session remains validated when only session documents remain required');

select * from finish();
rollback;
