import assert from "node:assert/strict";
import test from "node:test";
import { isolatedTsModule } from "./helpers/isolatedTsModule.mjs";
import { prioritizeStudioClientFollowups } from "../src/lib/daily/pilotageFollowupQueue.mjs";

function setup(count, failingOffset = null) {
 const reminders = Array.from({length:count},(_,i)=>({
  id:`reminder-${String(i).padStart(5,"0")}`,client_email:"test@example.test",
  dossier_id:"dossier-1",reminder_type:"invoice_followup",
  subject:"Relance",due_at:"2020-01-01T00:00:00.000Z",metadata:{},
 }));
 const ranges=[];
 const admin={from(table){
  assert.equal(table,"client_reminders");
  return {
   select(){return this;},in(){return this;},order(){return this;},
   async range(start,end){
    ranges.push([start,end]);
    if(start===failingOffset)return {data:null,error:{message:"page indisponible"}};
    return {data:reminders.slice(start,end+1),error:null};
   },
  };
 }};
 const {getStudioClientFollowups}=isolatedTsModule("src/lib/server/studioClientFollowups.ts",{
  "@/lib/franceBusinessTime":{isOverdueAfterBusinessHours:()=>false},
  "@/lib/daily/signatureReminder24h":{isSignatureTerminal:()=>false},
  "@/lib/server/dailyAttendanceClientFollowups":{getDailyAttendanceClientFollowups:async()=>[]},
  "@/lib/daily/pilotageFollowupQueue.mjs": { prioritizeStudioClientFollowups },
  "@/lib/server/supabaseAdmin":{createSupabaseAdminClient:()=>admin},
 });
 return {run:()=>getStudioClientFollowups({id:"agent-1",role:"admin"}),ranges};
}

test("AR1 retourne 1201 rappels répartis sur trois pages, sans doublons",async()=>{
 const {run,ranges}=setup(1201);
 const rows=await run();
 assert.equal(rows.length,1201);
 assert.equal(new Set(rows.map(x=>x.id)).size,1201);
 assert.equal(rows[0].id,"reminder-00000");
 assert.equal(rows.at(-1).id,"reminder-01200");
 assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499]]);
});

test("AR1 ne perd pas la dernière page exactement pleine",async()=>{
 const {run,ranges}=setup(1000);
 assert.equal((await run()).length,1000);
 assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499]]);
});

test("AR1 échoue explicitement lorsqu'une page intermédiaire est indisponible",async()=>{
 const {run}=setup(1201,500);
 await assert.rejects(run(),/Relances clients indisponibles : page indisponible/);
});
