import assert from "node:assert/strict";
import test from "node:test";
import { isolatedTsModule } from "./helpers/isolatedTsModule.mjs";

function fixture(count, failAt = -1) {
 const organisation_id="org-1",session_id="session-1";
 const communications=Array.from({length:count},(_,i)=>({
  id:`communication-${i}`,organisation_id,session_id,enrolment_id:`enrolment-${i}`,
  recipient_email:"learner@example.test",recipient_name:"Apprenant",status:"sent",
  sent_at:"2020-01-01T09:00:00Z",created_at:"2020-01-01T09:00:00Z",
  communication_type:"attendance_reminder",metadata:{attendance_slot_id:`slot-${i}`},
 }));
 const tables={
  daily_organisation_assignments:[{organisation_id,agent_profile_id:"agent-1"}],
  daily_communications:communications,
  daily_session_enrolments:communications.map(c=>({id:c.enrolment_id,session_id,status:"active",daily_learners:{first_name:"Test"}})),
  daily_attendance_slots:communications.map((c,i)=>({id:`slot-${i}`,session_id,status:"finished",slot_date:"2020-01-01",starts_at:"08:00",ends_at:"09:00"})),
  daily_attendance_records:[],
  daily_sessions:[{id:session_id,status:"completed",internal_reference:"S1",daily_formations:{title:"Formation"}}],
 };
 const ranges=[];
 const admin={from(table){
  assert.ok(Object.hasOwn(tables,table),table);
  return {
   select(){return this;},in(){return this;},order(){return this;},
   async range(start,end){
    assert.equal(table,"daily_communications");
    ranges.push([start,end]);
    if(start===failAt)return {data:null,error:{message:"simulation panne"}};
    return {data:tables[table].slice(start,end+1),error:null};
   },
   then(resolve,reject){return Promise.resolve({data:tables[table],error:null}).then(resolve,reject);},
  };
 }};
 const {getDailyAttendanceClientFollowups}=isolatedTsModule("src/lib/server/dailyAttendanceClientFollowups.ts",{
  "@/lib/franceBusinessTime":{isOverdueAfterBusinessHours:()=>true},
  "@/lib/server/dailyOrganisationScope":{getActiveDailyOrganisationIds:async()=>[organisation_id]},
  "@/lib/server/supabaseAdmin":{createSupabaseAdminClient:()=>admin},
 },{Intl,Map,Set});
 return {run:()=>getDailyAttendanceClientFollowups({id:"agent-1",role:"admin"}),ranges};
}

test("AR1 traite 1201 communications sur trois pages sans doublons",async()=>{
 const {run,ranges}=fixture(1201);
 const result=await run();
 assert.equal(result.length,1201);
 assert.equal(new Set(result.map(x=>x.id)).size,1201);
 assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499]]);
});

test("AR1 lit la page sentinelle après 1000 communications",async()=>{
 const {run,ranges}=fixture(1000);
 assert.equal((await run()).length,1000);
 assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499]]);
});

test("AR1 échoue explicitement si une page de communications échoue",async()=>{
 const {run}=fixture(1201,500);
 await assert.rejects(run(),/Relances d’émargement indisponibles : simulation panne/);
});
