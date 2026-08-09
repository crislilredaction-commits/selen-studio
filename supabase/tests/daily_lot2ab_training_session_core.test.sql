begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('18000000-0000-4000-8400-000000000001','authenticated','authenticated','lot2ab-owner-a@example.invalid','x',now(),now(),now()),
('18000000-0000-4000-8400-000000000002','authenticated','authenticated','lot2ab-owner-b@example.invalid','x',now(),now(),now());

insert into public.organisations(id,name,siret,status) values
('18000000-0000-4000-8400-000000000010','Lot2AB Org A','97000000000001','active'),
('18000000-0000-4000-8400-000000000020','Lot2AB Org B','97000000000002','active');

insert into public.organisation_memberships(id,organisation_id,user_id,status,primary_role,joined_at) values
('18000000-0000-4000-8400-000000000011','18000000-0000-4000-8400-000000000010','18000000-0000-4000-8400-000000000001','active','manager',now()),
('18000000-0000-4000-8400-000000000021','18000000-0000-4000-8400-000000000020','18000000-0000-4000-8400-000000000002','active','manager',now());

insert into public.organisation_membership_roles(membership_id,role) values
('18000000-0000-4000-8400-000000000011','manager'),
('18000000-0000-4000-8400-000000000021','manager');

insert into public.daily_trainer_profiles(id,organisation_id,professional_email,display_name,status,engagement_type) values
('18000000-0000-4000-8400-000000000031','18000000-0000-4000-8400-000000000010','trainer-a@example.invalid','Trainer A','draft','external'),
('18000000-0000-4000-8400-000000000032','18000000-0000-4000-8400-000000000020','trainer-b@example.invalid','Trainer B','draft','external'),
('18000000-0000-4000-8400-000000000033','18000000-0000-4000-8400-000000000010','trainer-archived@example.invalid','Trainer Archived','archived','external');

insert into public.daily_formations(
 id,user_id,organisation_id,title,global_objective,learning_objectives,target_audience,prerequisites,
 duration_hours,duration_days,modality,modality_details,access_delays,registration_methods,price,
 detailed_program,accessibility,pedagogical_methods,pedagogical_resources,evaluation_methods,
 results_pending,contact_phone,contact_email,status
) values (
 '18000000-0000-4000-8400-000000000040','18000000-0000-4000-8400-000000000001','18000000-0000-4000-8400-000000000010',
 'Formation test','Objectif global','["Objectif 1","Objectif 2"]'::jsonb,'Professionnels','Aucun',14,2,'presentiel','En salle','Sous 7 jours','Inscription Selen','1000 €',
 'Programme','Accessible','Méthode active','Supports et exercices','Quiz et mise en situation',true,'0102030405','contact@example.invalid','draft'
);

select is((select jsonb_array_length(learning_objectives) from public.daily_formations where id='18000000-0000-4000-8400-000000000040'),2,'formation stores structured learning objectives');
select is((select pedagogical_methods from public.daily_formations where id='18000000-0000-4000-8400-000000000040'),'Méthode active','formation stores pedagogical methods separately');
select throws_ok($$update public.daily_formations set learning_objectives='[""]'::jsonb where id='18000000-0000-4000-8400-000000000040'$$,'P0001','learning objectives must be non-empty strings','empty learning objective is rejected');
select throws_ok($$update public.daily_formations set learning_objectives='{}'::jsonb where id='18000000-0000-4000-8400-000000000040'$$,'P0001','learning_objectives must be an array','learning objectives must be an array');

insert into public.daily_sessions(
 id,user_id,organisation_id,formation_id,internal_reference,max_participants,modality,start_date,end_date,
 schedule_blocks,location_address,companies,beneficiaries,individual_beneficiaries,trainer_ids,status
) values (
 '18000000-0000-4000-8400-000000000050','18000000-0000-4000-8400-000000000001','18000000-0000-4000-8400-000000000010','18000000-0000-4000-8400-000000000040',
 'SES-TEST-001',12,'presentiel','2026-09-10','2026-09-11','[{"date":"2026-09-10","start":"09:00","end":"17:00","note":"Jour 1"},{"date":"2026-09-11","start":"09:00","end":"17:00","note":"Jour 2"}]'::jsonb,
 '1 rue Test','[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'["18000000-0000-4000-8400-000000000031"]'::jsonb,'draft'
);

select is((select max_participants from public.daily_sessions where id='18000000-0000-4000-8400-000000000050'),12,'session stores maximum capacity');
select is((select internal_reference from public.daily_sessions where id='18000000-0000-4000-8400-000000000050'),'SES-TEST-001','session stores internal reference');
select is((select jsonb_array_length(trainer_ids) from public.daily_sessions where id='18000000-0000-4000-8400-000000000050'),1,'session accepts active trainer from same organisation');
select throws_ok($$update public.daily_sessions set max_participants=0 where id='18000000-0000-4000-8400-000000000050'$$,'23514',null,'zero session capacity is rejected');
select throws_ok($$update public.daily_sessions set schedule_blocks='[{"date":"2026-09-09","start":"09:00","end":"17:00"}]'::jsonb where id='18000000-0000-4000-8400-000000000050'$$,'P0001','schedule block cannot start before session','schedule cannot be outside session dates');
select throws_ok($$update public.daily_sessions set schedule_blocks='[{"date":"2026-09-10","start":"17:00","end":"09:00"}]'::jsonb where id='18000000-0000-4000-8400-000000000050'$$,'P0001','schedule block end time must be after start time','schedule end must be after start');
select throws_ok($$update public.daily_sessions set trainer_ids='["18000000-0000-4000-8400-000000000032"]'::jsonb where id='18000000-0000-4000-8400-000000000050'$$,'P0001','session trainer must belong to the organisation and be active','trainer from another organisation is rejected');
select throws_ok($$update public.daily_sessions set trainer_ids='["18000000-0000-4000-8400-000000000033"]'::jsonb where id='18000000-0000-4000-8400-000000000050'$$,'P0001','session trainer must belong to the organisation and be active','archived trainer is rejected');

select * from finish();
rollback;
