import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const org='20000000-0000-4000-8000-000000000001',session='20000000-0000-4000-8000-000000000002',enrolment='20000000-0000-4000-8000-000000000003';
test('état documentaire canonique : préparation, relecture, publication et tâche',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table daily_sessions(id uuid primary key,organisation_id uuid,formation_id uuid,status text);
 create table daily_session_enrolments(id uuid primary key,organisation_id uuid,session_id uuid,status text,contracting_party_type text,company_name text);
 create table daily_documents(id uuid default gen_random_uuid(),organisation_id uuid,document_type text,linked_object_type text,linked_object_id uuid,is_current boolean,status text,version int default 1,created_at timestamptz default now(),metadata jsonb);
 create table daily_session_checklist_items(id uuid default gen_random_uuid(),session_id uuid,organisation_id uuid,item_key text,phase text,responsibility text,label text,description text,status text,note text,signaled_at timestamptz);
 insert into daily_sessions values('${session}','${org}');insert into daily_session_enrolments values('${enrolment}','${org}','${session}','pending','individual',null);
 insert into daily_session_checklist_items(session_id,item_key,status)values('${session}','pretraining_documents','todo');
 create table daily_formations(id uuid,organisation_id uuid,status text,title text);
 create table daily_formation_registration_requests(id uuid,attached_session_id uuid,formation_id uuid,decision_status text);
 create table organisations(id uuid,name text);create table daily_organisation_assignments(organisation_id uuid,agent_profile_id uuid);create table agent_profiles(id uuid,user_id uuid,is_active boolean);
 create table notifications(type text,title text,content text,organisation_name text,link_path text,target_role text,target_user_id uuid,target_agent_profile_id uuid,pinned boolean,read_at timestamptz,dismissed_at timestamptz,escalation_at timestamptz,created_at timestamptz,source_key text,source_kind text);
 create function daily_a11_organisation_is_active(uuid) returns boolean language sql as 'select false';
 create function daily_session_checklist_phase_available(uuid,text) returns boolean language sql as 'select false';
 `);
 const sql=await readFile(new URL('../supabase/migrations/20261014073931_daily_pretraining_publication_progress.sql',import.meta.url),'utf8');
 // The notification routine has the live table contract; no notification is sent.
 await db.exec(sql);
 const progress=async()=> (await db.query('select daily_pretraining_document_progress($1) as state',[session])).rows[0].state;
 const sync=async()=>{await db.query('select daily_sync_session_pretraining_checklist($1)',[session]);return(await db.query("select status from daily_session_checklist_items where item_key='pretraining_documents'")).rows[0].status;};
 assert.equal((await progress()).expected_count,6);assert.equal(await sync(),'todo');
 for(const type of ['training_program','welcome_booklet','internal_regulations','training_contract','convocation','registration_positioning'])await db.query('insert into daily_documents(organisation_id,document_type,linked_object_type,linked_object_id,is_current,status,metadata)values($1,$2,$3,$4,true,$5,$6)',[org,type,['training_contract','convocation','registration_positioning'].includes(type)?'enrolment':'session',['training_contract','convocation','registration_positioning'].includes(type)?enrolment:session,'to_check',{}]);
 assert.equal(await sync(),'to_review');assert.equal((await progress()).prepared_count,6);
 await db.exec("update daily_documents set status='validated'");assert.equal(await sync(),'to_review');assert.equal((await progress()).requires_publication,true);
 await db.exec("update daily_documents set status='published' where document_type<>'internal_regulations'");assert.equal(await sync(),'to_review');
 await db.exec("update daily_documents set status='published'");assert.equal(await sync(),'validated');assert.equal((await progress()).published_count,6);
 await t.test('un document d’un autre OF ne satisfait aucune pièce manquante',async()=>{await db.exec("update daily_documents set status='to_check' where document_type='training_contract'");await db.query('insert into daily_documents(organisation_id,document_type,linked_object_type,linked_object_id,is_current,status)values($1,$2,$3,$4,true,$5)',['20000000-0000-4000-8000-000000000099','training_contract','enrolment',enrolment,'published']);assert.equal(await sync(),'to_review');});
 await t.test('une nouvelle version en relecture empêche une ancienne publication de clore la tâche',async()=>{await db.exec("update daily_documents set status='published'");await db.query('insert into daily_documents(organisation_id,document_type,linked_object_type,linked_object_id,is_current,status,version)values($1,$2,$3,$4,true,$5,2)',[org,'training_contract','enrolment',enrolment,'to_check']);assert.equal(await sync(),'to_review');});
 await t.test('une partie contractante non choisie demeure bloquante',async()=>{await db.exec('update daily_session_enrolments set contracting_party_type=null');assert.equal(await sync(),'blocked');});
 await t.test('RPC de progression non accessible aux rôles navigateur',async()=>{for(const role of ['anon','authenticated']){assert.equal((await db.query("select has_function_privilege($1,'daily_pretraining_document_progress(uuid)','execute') as allowed",[role])).rows[0].allowed,false);}});
});
