begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('23000000-0000-4000-8400-000000000001','authenticated','authenticated','lot3d-manager@example.invalid','x',now(),now(),now());
insert into public.organisations(id,name,siret,status) values
('23000000-0000-4000-8400-000000000010','Lot3D OF','99300000000001','active');
insert into public.organisation_memberships(id,organisation_id,user_id,status,primary_role,joined_at) values
('23000000-0000-4000-8400-000000000020','23000000-0000-4000-8400-000000000010','23000000-0000-4000-8400-000000000001','active','manager',now());
insert into public.organisation_membership_roles(membership_id,role) values
('23000000-0000-4000-8400-000000000020','manager');
insert into public.daily_formations(id,user_id,organisation_id,title,global_objective,learning_objectives,target_audience,prerequisites,duration_hours,duration_days,modality,modality_details,access_delays,registration_methods,price,detailed_program,accessibility,pedagogical_methods,pedagogical_resources,evaluation_methods,results_pending,contact_phone,contact_email,status) values
('23000000-0000-4000-8400-000000000030','23000000-0000-4000-8400-000000000001','23000000-0000-4000-8400-000000000010','Formation 3D','Objectif','["Objectif"]','Public','Aucun',7,1,'presentiel','Salle','7 jours','Selen','500','Programme','Accessible','Méthode','Supports','Quiz',true,'0102030405','lot3d@example.invalid','draft');
insert into public.daily_sessions(id,user_id,organisation_id,formation_id,internal_reference,max_participants,modality,start_date,end_date,schedule_blocks,location_address,companies,beneficiaries,individual_beneficiaries,trainer_ids,status) values
('23000000-0000-4000-8400-000000000040','23000000-0000-4000-8400-000000000001','23000000-0000-4000-8400-000000000010','23000000-0000-4000-8400-000000000030','SES-3D',10,'presentiel','2026-10-01','2026-10-01','[{"date":"2026-10-01","start":"09:00","end":"17:00"}]','1 rue Test','[]','[]','[]','[]','draft');
insert into public.daily_learners(id,organisation_id,first_name,last_name,email,created_by) values
('23000000-0000-4000-8400-000000000050','23000000-0000-4000-8400-000000000010','Alice','Martin','alice-3d@example.invalid','23000000-0000-4000-8400-000000000001');
insert into public.daily_session_enrolments(id,organisation_id,session_id,learner_id,status,created_by) values
('23000000-0000-4000-8400-000000000060','23000000-0000-4000-8400-000000000010','23000000-0000-4000-8400-000000000040','23000000-0000-4000-8400-000000000050','confirmed','23000000-0000-4000-8400-000000000001');

select is((select status from public.daily_session_checklist_items where session_id='23000000-0000-4000-8400-000000000040' and item_key='posttraining_documents'),'todo','posttraining checklist starts todo');

insert into public.daily_documents(organisation_id,document_type,linked_object_type,linked_object_id,version,status,logical_name,bucket,storage_path,is_current) values
('23000000-0000-4000-8400-000000000010','attendance_report','session','23000000-0000-4000-8400-000000000040',1,'to_check','attendance','documents','tests/3d/attendance.pdf',true);
select is((select status from public.daily_session_checklist_items where session_id='23000000-0000-4000-8400-000000000040' and item_key='posttraining_documents'),'in_progress','partial posttraining set moves checklist in progress');
select throws_ok($$insert into public.daily_documents(organisation_id,document_type,linked_object_type,linked_object_id,version,status,logical_name,bucket,storage_path,is_current) values('23000000-0000-4000-8400-000000000010','completion_certificate','session','23000000-0000-4000-8400-000000000040',1,'to_check','bad-link','documents','tests/3d/bad.pdf',true)$$,'P0001','Daily learner post-training document must link to an enrolment','completion certificate must link to enrolment');

insert into public.daily_documents(organisation_id,document_type,linked_object_type,linked_object_id,version,status,logical_name,bucket,storage_path,is_current) values
('23000000-0000-4000-8400-000000000010','satisfaction_summary','session','23000000-0000-4000-8400-000000000040',1,'to_check','satisfaction','documents','tests/3d/satisfaction.pdf',true),
('23000000-0000-4000-8400-000000000010','completion_certificate','enrolment','23000000-0000-4000-8400-000000000060',1,'to_check','completion','documents','tests/3d/completion.pdf',true);
select is((select status from public.daily_session_checklist_items where session_id='23000000-0000-4000-8400-000000000040' and item_key='posttraining_documents'),'to_review','complete generated set moves checklist to review');
select is((select note from public.daily_session_checklist_items where session_id='23000000-0000-4000-8400-000000000040' and item_key='posttraining_documents'),'3/3 document(s) postformation préparé(s).','expected set is two session docs plus one learner certificate');

update public.daily_documents set status='validated' where organisation_id='23000000-0000-4000-8400-000000000010' and storage_path like 'tests/3d/%';
select is((select status from public.daily_session_checklist_items where session_id='23000000-0000-4000-8400-000000000040' and item_key='posttraining_documents'),'validated','validated posttraining set validates checklist');
select is((select note from public.daily_session_checklist_items where session_id='23000000-0000-4000-8400-000000000040' and item_key='posttraining_documents'),'3 document(s) postformation validé(s).','validated checklist reports expected count');

update public.daily_session_enrolments set status='cancelled' where id='23000000-0000-4000-8400-000000000060';
select is((select note from public.daily_session_checklist_items where session_id='23000000-0000-4000-8400-000000000040' and item_key='posttraining_documents'),'2 document(s) postformation validé(s).','cancelled enrolment removes completion certificate from expected set');
select is((select status from public.daily_session_checklist_items where session_id='23000000-0000-4000-8400-000000000040' and item_key='posttraining_documents'),'validated','session remains validated with both session docs');

select * from finish();
rollback;
