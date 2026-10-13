import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../supabase/migrations/20261013173007_daily_pretraining_accepted_admission_handoff.sql", import.meta.url), "utf8");
const lifecycle = await readFile(new URL("../supabase/migrations/20261006191034_daily_a11_task_lifecycle_notifications.sql", import.meta.url), "utf8");
const candidatureTriggerFunction = lifecycle.match(/create or replace function public\.daily_a11_resync_candidature_notifications\(\)[\s\S]*?\$\$;/i)[0];
const org="11111111-1111-4111-8111-111111111111", formation="22222222-2222-4222-8222-222222222222";
const session="33333333-3333-4333-8333-333333333333", item="44444444-4444-4444-8444-444444444444";
const agent="55555555-5555-4555-8555-555555555555", user="66666666-6666-4666-8666-666666666666";

test("la décision OF déclenche la tâche documentaire et sa notification, sans formulaire hérité", async t=>{
  const db=new PGlite(); t.after(()=>db.close());
  await db.exec(`
    create table organisations(id uuid primary key,name text);
    create table daily_sessions(id uuid primary key,organisation_id uuid,formation_id uuid,status text);
    create table daily_formations(id uuid primary key,organisation_id uuid,status text,title text);
    create table daily_session_checklist_items(id uuid primary key,session_id uuid,organisation_id uuid,item_key text,phase text,status text,responsibility text,signaled_at timestamptz,label text,description text);
    create table daily_formation_registration_requests(id int primary key,attached_session_id uuid,formation_id uuid,decision_status text);
    create table daily_organisation_assignments(organisation_id uuid,agent_profile_id uuid);
    create table agent_profiles(id uuid primary key,user_id uuid,is_active boolean);
    create table notifications(type text,title text,content text,organisation_name text,link_path text,target_role text,target_user_id uuid,target_agent_profile_id uuid,pinned boolean,read_at timestamptz,dismissed_at timestamptz,escalation_at timestamptz,created_at timestamptz,source_key text,source_kind text);
    create unique index notifications_source_key on notifications(source_key) where source_key is not null;
    create function daily_a11_organisation_is_active(uuid) returns boolean language sql as 'select $1 is not null';
    create function daily_session_checklist_phase_available(uuid,text) returns boolean language sql as 'select $2 = ''before''';
    insert into organisations values('${org}','OF exemple');
    insert into daily_formations values('${formation}','${org}','validated','Formation exemple');
    insert into daily_sessions values('${session}','${org}','${formation}','ready');
    insert into agent_profiles values('${agent}','${user}',true);
    insert into daily_organisation_assignments values('${org}','${agent}');
    insert into daily_session_checklist_items values('${item}','${session}','${org}','pretraining_documents','before','todo','shared',now(),'Préparer les documents','Relecture avant publication');
    insert into daily_formation_registration_requests values(1,'${session}','${formation}','ready_for_of');
  `);
  await db.exec(migration);
  await db.exec(`create function daily_a11_resync_session_notifications(p_session_id uuid) returns void language plpgsql as $$
    declare checklist_id uuid; begin
      for checklist_id in select id from daily_session_checklist_items where session_id=p_session_id loop
        perform daily_sync_session_checklist_notification(checklist_id);
      end loop;
    end; $$;`);
  await db.exec(candidatureTriggerFunction);
  await db.exec(`create trigger daily_a11_candidature_notification_lifecycle after insert or update of decision_status,attached_session_id or delete on daily_formation_registration_requests for each row execute function daily_a11_resync_candidature_notifications();`);
  const notices=async()=> (await db.query("select * from notifications where dismissed_at is null")).rows;
  assert.equal((await notices()).length,0,"L'analyse Selen seule ne vaut pas décision OF.");
  await db.exec("update daily_formation_registration_requests set decision_status='accepted' where id=1");
  const [notice]=await notices(); assert.ok(notice);
  assert.equal(notice.source_key,`daily_session_checklist:${item}`);
  assert.equal(notice.link_path,`/agent/daily/pretraining-documents?session=${session}`);
  assert.equal(notice.target_agent_profile_id,agent); assert.equal(notice.target_user_id,user);
  assert.equal(notice.target_role,"agent");
  await db.exec(`select daily_sync_session_checklist_notification('${item}');`);
  assert.equal((await notices()).length,1,"La notification est idempotente.");
  await db.exec("update daily_formation_registration_requests set decision_status='refused' where id=1");
  assert.equal((await notices()).length,0); assert.equal((await db.query("select count(*) as n from notifications")).rows[0].n,1,"L'historique est conservé.");
  await db.exec("update daily_formation_registration_requests set decision_status='accepted' where id=1");
  await db.exec(`update daily_session_checklist_items set status='validated' where id='${item}'; select daily_sync_session_checklist_notification('${item}');`);
  assert.equal((await notices()).length,0);
  await db.exec(`update daily_session_checklist_items set status='todo',organisation_id='77777777-7777-4777-8777-777777777777' where id='${item}'; select daily_sync_session_checklist_notification('${item}');`);
  assert.equal((await notices()).length,0,"Les rattachements incohérents ne donnent aucun accès.");
});
