begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('1a000000-0000-4000-8400-000000000001','authenticated','authenticated','lot3e-client@example.invalid','x',now(),now(),now()),
('1a000000-0000-4000-8400-000000000002','authenticated','authenticated','lot3e-agent@example.invalid','x',now(),now(),now());
insert into public.agent_profiles(id,user_id,email,role,is_active,first_name,last_name) values
('1a000000-0000-4000-8400-000000000010','1a000000-0000-4000-8400-000000000002','lot3e-agent@example.invalid','agent',true,'Agent','3E');
insert into public.organisations(id,name,siret,status) values('1a000000-0000-4000-8400-000000000020','Lot3E OF','98000000000021','active');
insert into public.organisation_memberships(id,organisation_id,user_id,status,primary_role,joined_at) values('1a000000-0000-4000-8400-000000000021','1a000000-0000-4000-8400-000000000020','1a000000-0000-4000-8400-000000000001','active','manager',now());
insert into public.organisation_membership_roles(membership_id,role) values('1a000000-0000-4000-8400-000000000021','manager');
insert into public.daily_organisation_assignments(organisation_id,agent_profile_id,assigned_by) values('1a000000-0000-4000-8400-000000000020','1a000000-0000-4000-8400-000000000010','1a000000-0000-4000-8400-000000000001');
insert into public.daily_formations(id,user_id,organisation_id,title,global_objective,learning_objectives,target_audience,prerequisites,duration_hours,duration_days,modality,modality_details,access_delays,registration_methods,price,detailed_program,accessibility,pedagogical_methods,pedagogical_resources,evaluation_methods,results_pending,contact_phone,contact_email,status)
values('1a000000-0000-4000-8400-000000000030','1a000000-0000-4000-8400-000000000001','1a000000-0000-4000-8400-000000000020','Formation 3E','Objectif','["Objectif 1"]'::jsonb,'Public','Aucun',7,1,'presentiel','Salle','7 jours','Selen','500 €','Programme','Accessible','Méthode','Supports','Quiz',true,'0102030405','contact@example.invalid','draft');
insert into public.daily_sessions(id,user_id,organisation_id,formation_id,internal_reference,max_participants,modality,start_date,end_date,schedule_blocks,location_address,companies,beneficiaries,individual_beneficiaries,trainer_ids,status)
values('1a000000-0000-4000-8400-000000000040','1a000000-0000-4000-8400-000000000001','1a000000-0000-4000-8400-000000000020','1a000000-0000-4000-8400-000000000030','SES-3E',10,'presentiel','2026-09-20','2026-09-20','[{"date":"2026-09-20","start":"09:00","end":"17:00"}]'::jsonb,'1 rue Test','[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'draft');

select is((select status from public.daily_session_dossiers where session_id='1a000000-0000-4000-8400-000000000040'),'active','new dossier starts active');
select throws_ok($$select public.daily_close_session_dossier('1a000000-0000-4000-8400-000000000040',null,'1a000000-0000-4000-8400-000000000002')$$,'P0001','Session dossier cannot be closed: 8 checklist item(s) remain incomplete','incomplete dossier cannot close');
select throws_ok($$update public.daily_session_checklist_items set status='validated' where session_id='1a000000-0000-4000-8400-000000000040' and item_key='selen_closure_review'$$,'P0001','Session dossier cannot be closed: 8 checklist item(s) remain incomplete','direct checklist update cannot bypass closure gate');

update public.daily_session_checklist_items set status='validated' where session_id='1a000000-0000-4000-8400-000000000040' and item_key<>'selen_closure_review';
select lives_ok($$select public.daily_close_session_dossier('1a000000-0000-4000-8400-000000000040','Dossier contrôlé.','1a000000-0000-4000-8400-000000000002')$$,'complete dossier closes');
select is((select status from public.daily_session_dossiers where session_id='1a000000-0000-4000-8400-000000000040'),'completed','closure marks dossier completed');
select ok((select completed_at is not null from public.daily_session_dossiers where session_id='1a000000-0000-4000-8400-000000000040'),'closure timestamps dossier on server');
select ok((select status='validated' and note='Dossier contrôlé.' and validated_by='1a000000-0000-4000-8400-000000000002'::uuid from public.daily_session_checklist_items where session_id='1a000000-0000-4000-8400-000000000040' and item_key='selen_closure_review'),'closure review records validation evidence');
select lives_ok($$select public.daily_archive_session_dossier('1a000000-0000-4000-8400-000000000040')$$,'completed dossier can be archived logically');
select is((select status from public.daily_session_dossiers where session_id='1a000000-0000-4000-8400-000000000040'),'archived','logical archive preserves dossier with archived status');

update public.daily_session_checklist_items set status='in_progress' where session_id='1a000000-0000-4000-8400-000000000040' and item_key='training_ready';
select is((select status from public.daily_session_dossiers where session_id='1a000000-0000-4000-8400-000000000040'),'active','upstream regression automatically reopens archived dossier');
select is((select status from public.daily_session_checklist_items where session_id='1a000000-0000-4000-8400-000000000040' and item_key='selen_closure_review'),'to_review','upstream regression reopens Selen closure review');
select ok(not has_function_privilege('authenticated','public.daily_close_session_dossier(uuid,text,uuid)','EXECUTE') and not has_function_privilege('authenticated','public.daily_reopen_session_dossier(uuid,text)','EXECUTE') and not has_function_privilege('authenticated','public.daily_archive_session_dossier(uuid)','EXECUTE'),'closure RPCs are not executable by authenticated clients');

select * from finish();
rollback;
