import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const org='30000000-0000-4000-8000-000000000001',session='30000000-0000-4000-8000-000000000002',enrolment='30000000-0000-4000-8000-000000000003',formation='30000000-0000-4000-8000-000000000004',agent='30000000-0000-4000-8000-000000000005',user='30000000-0000-4000-8000-000000000006';
const read=file=>readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8');
const routine=(sql,name)=>sql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`,'i'))[0];

test('les vrais déclencheurs documentaires synchronisent tâche, publication et notification historique',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create function auth.uid()returns uuid language sql as 'select null::uuid';
 create table organisations(id uuid primary key,name text);
 create table daily_sessions(id uuid primary key,organisation_id uuid,formation_id uuid,status text);
 create table daily_formations(id uuid primary key,organisation_id uuid,status text,title text);
 create table daily_session_enrolments(id uuid primary key,organisation_id uuid,session_id uuid,status text,contracting_party_type text,company_name text);
 create table daily_documents(id uuid default gen_random_uuid(),organisation_id uuid,document_type text,linked_object_type text,linked_object_id uuid,is_current boolean,status text,version int default 1,created_at timestamptz default now(),metadata jsonb default '{}');
 create table daily_session_checklist_items(id uuid default gen_random_uuid(),session_id uuid,organisation_id uuid,item_key text,phase text,responsibility text,label text,description text,status text,note text,signaled_at timestamptz,updated_at timestamptz,started_at timestamptz,completed_at timestamptz,validated_by uuid);
 create table daily_formation_registration_requests(id uuid default gen_random_uuid(),attached_session_id uuid,formation_id uuid,decision_status text);
 create table daily_organisation_assignments(organisation_id uuid,agent_profile_id uuid);
 create table agent_profiles(id uuid primary key,user_id uuid,is_active boolean);
 create table notifications(type text,title text,content text,organisation_name text,link_path text,target_role text,target_user_id uuid,target_agent_profile_id uuid,pinned boolean,read_at timestamptz,dismissed_at timestamptz,escalation_at timestamptz,created_at timestamptz,source_key text,source_kind text);
 create unique index notifications_source_key on notifications(source_key)where source_key is not null;
 create function daily_a11_organisation_is_active(uuid)returns boolean language sql as 'select $1 is not null';
 create function daily_session_checklist_phase_available(uuid,text)returns boolean language sql as 'select false';
 insert into organisations values('${org}','OF QA');insert into daily_formations values('${formation}','${org}','archived','Formation historique QA');
 insert into daily_sessions values('${session}','${org}','${formation}','ready');
 insert into daily_session_enrolments values('${enrolment}','${org}','${session}','confirmed','individual',null);
 insert into agent_profiles values('${agent}','${user}',true);insert into daily_organisation_assignments values('${org}','${agent}');
 insert into daily_formation_registration_requests(attached_session_id,formation_id,decision_status)values('${session}','${formation}','accepted');
 insert into daily_session_checklist_items(session_id,organisation_id,item_key,phase,responsibility,label,status,signaled_at,completed_at,validated_by)values('${session}','${org}','pretraining_documents','before','selen','Préparer les pièces','validated','2000-01-01T00:00:00Z','2000-01-02T00:00:00Z','${user}');`);
 const legacy=await read('20260810045343_daily_lot2e_pretraining_document_registry.sql');
 const monotonic=await read('20260915010000_daily_checklist_monotonic_completion.sql');
 await db.exec(routine(monotonic,'daily_maintain_session_checklist_timestamps'));
 await db.exec(routine(legacy,'daily_sync_pretraining_document_checklist_trigger'));
 await db.exec(routine(legacy,'daily_validate_pretraining_document_scope'));
 await db.exec(`create trigger daily_session_checklist_timestamps before insert or update on daily_session_checklist_items for each row execute function daily_maintain_session_checklist_timestamps();
 create trigger daily_documents_sync_pretraining_checklist after insert or update or delete on daily_documents for each row execute function daily_sync_pretraining_document_checklist_trigger();
 create trigger daily_documents_validate_pretraining_scope before insert or update of organisation_id,document_type,linked_object_type,linked_object_id on daily_documents for each row execute function daily_validate_pretraining_document_scope();`);
 const beforeMigration=(await db.query('select * from daily_session_checklist_items')).rows;
 const migration=await read('20261014003923_daily_pretraining_publication_progress.sql');
 await db.exec(migration);await db.exec(migration);
 assert.deepEqual((await db.query('select * from daily_session_checklist_items')).rows,beforeMigration,'Appliquer le DDL ne recalcule et ne réécrit aucune tâche cliente.');
 const item=async()=> (await db.query("select * from daily_session_checklist_items where item_key='pretraining_documents'")).rows[0];
 const notices=async()=> (await db.query('select * from notifications where dismissed_at is null')).rows;
 for(const type of ['training_program','welcome_booklet','internal_regulations','training_contract','convocation','registration_positioning']){
  const individual=['training_contract','convocation','registration_positioning'].includes(type);
  await db.query('insert into daily_documents(organisation_id,document_type,linked_object_type,linked_object_id,is_current,status)values($1,$2,$3,$4,true,$5)',[org,type,individual?'enrolment':'session',individual?enrolment:session,'to_check']);
 }
 assert.equal((await item()).status,'to_review','Une clôture héritée ne doit pas masquer les documents restant à publier.');
 assert.equal((await notices()).length,1);assert.equal((await notices())[0].target_user_id,user);assert.match((await notices())[0].link_path,/pretraining-documents\?session=/);
 assert.equal((await item()).completed_at.toISOString(),'2000-01-02T00:00:00.000Z');assert.equal((await item()).validated_by,user,'La preuve de clôture antérieure reste historisée.');
 await db.exec("update daily_documents set status='validated'");assert.equal((await item()).status,'to_review');assert.equal((await notices()).length,1);
 await db.exec("update daily_documents set status='published' where document_type<>'internal_regulations'");assert.equal((await item()).status,'to_review');
 await db.exec("update daily_documents set status='published' where document_type='internal_regulations'");assert.equal((await item()).status,'validated');assert.equal((await notices()).length,0);assert.equal((await db.query('select count(*)::int as n from notifications')).rows[0].n,1);
 await t.test('nouvelle version non publiée : tâche et notification réactivées sans doublon',async()=>{
  await db.query("insert into daily_documents(organisation_id,document_type,linked_object_type,linked_object_id,is_current,status,version)values($1,'training_contract','enrolment',$2,true,'to_check',2)",[org,enrolment]);
  assert.equal((await item()).status,'to_review');assert.equal((await notices()).length,1);assert.equal((await db.query('select count(*)::int as n from notifications')).rows[0].n,1);
  await db.exec("update daily_session_checklist_items set status='validated' where item_key='pretraining_documents'");assert.equal((await item()).status,'to_review','Une case cochée ne remplace pas la publication.');
 });
 await t.test('un échec de notification annule aussi la transition du document et de la tâche',async()=>{
  await db.exec(`create function reject_notice() returns trigger language plpgsql as $$begin raise exception 'notification unavailable';end;$$;
  create trigger reject_notice before update on notifications for each row execute function reject_notice();`);
  try{await assert.rejects(db.exec("update daily_documents set status='published' where document_type='training_contract' and version=2"),/notification unavailable/);
    assert.equal((await db.query("select status from daily_documents where document_type='training_contract' and version=2")).rows[0].status,'to_check');assert.equal((await item()).status,'to_review');assert.equal((await notices()).length,1);
  }finally{await db.exec('drop trigger reject_notice on notifications');}
 });
 await t.test('un rôle navigateur ne peut clore la préparation sans publication',async()=>{
  await db.exec('grant usage on schema public to authenticated;grant select,update on daily_session_checklist_items to authenticated;set role authenticated');
  try{await assert.rejects(db.exec("update daily_session_checklist_items set status='validated' where item_key='pretraining_documents'"),error=>error.code==='42501');}
  finally{await db.exec('reset role');}
  assert.equal((await item()).status,'to_review');
 });
 await t.test('une tâche générique terminée et une dispense restent monotones',async()=>{
  await db.query("insert into daily_session_checklist_items(session_id,organisation_id,item_key,status,completed_at,validated_by)values($1,$2,'trainer_assignment','validated','2000-01-02',$3)",[session,org,user]);
  await db.exec("update daily_session_checklist_items set status='todo' where item_key='trainer_assignment'");assert.equal((await db.query("select status from daily_session_checklist_items where item_key='trainer_assignment'")).rows[0].status,'validated');
  await db.exec("update daily_session_checklist_items set status='not_applicable' where item_key='pretraining_documents'");await db.exec("update daily_documents set status='published'");assert.equal((await item()).status,'not_applicable');
 });
 await t.test('livret et règlement d’un autre organisme refusés par le trigger de périmètre',async()=>{
  for(const type of ['welcome_booklet','internal_regulations'])await assert.rejects(db.query('insert into daily_documents(organisation_id,document_type,linked_object_type,linked_object_id,is_current,status)values($1,$2,$3,$4,true,$5)',['30000000-0000-4000-8000-000000000099',type,'session',session,'to_check']),/organisation mismatch/);
 });
});
