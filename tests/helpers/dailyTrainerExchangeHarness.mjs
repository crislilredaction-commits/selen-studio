import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import assert from "node:assert/strict";
import React from "react";
import * as jsx from "react/jsx-runtime";
export const ids={org:"11111111-1111-4111-8111-111111111111",trainer:"22222222-2222-4222-8222-222222222222",session:"33333333-3333-4333-8333-333333333333",other:"44444444-4444-4444-8444-444444444444"};
export function exchangeHarness(options={}) {
 const trainer={id:ids.trainer,organisation_id:ids.org,display_name:"Formatrice exemple",professional_email:"manager@example.test",user_id:null,membership_id:null,engagement_type:"external",status:"validated",active:true};
 const session={id:ids.session,organisation_id:ids.org,formation_id:"formation",trainer_ids:[ids.trainer],status:"ready",registration_status:"summary_validated",start_date:"2026-10-12",end_date:"2026-10-13",daily_formations:{title:"Formation exemple"}};
 const enrolment={id:"enrolment",organisation_id:ids.org,session_id:ids.session,learner_id:"learner",status:"confirmed",positioning_status:"reviewed",daily_learners:{first_name:"Alice",last_name:"Exemple",email:"alice@example.test"}};
 const cancelled={...enrolment,id:"cancelled-enrolment",status:"cancelled",daily_learners:{first_name:"Historique",last_name:"Annulé"}};
 const db={daily_trainer_profiles:[trainer],daily_sessions:[session,{...session,id:ids.other,trainer_ids:[]}],daily_session_enrolments:[enrolment,cancelled],
  daily_attendance_slots:[{id:"slot",organisation_id:ids.org,session_id:ids.session,slot_date:"2026-10-12",starts_at:"09:00",ends_at:"12:00",status:"closed"}],
  daily_attendance_records:[{id:"record",organisation_id:ids.org,session_id:ids.session,slot_id:"slot",enrolment_id:"enrolment",status:"present",signed_at:"2026-10-12T10:00:00Z",signature_storage_path:"private-proof"},
   {id:"historical",organisation_id:ids.org,session_id:ids.session,slot_id:"slot",enrolment_id:"cancelled-enrolment",status:"present",signed_at:"2026-10-12T10:00:00Z"}],
  organisations:[{id:ids.org,name:"Organisme exemple"}],daily_formations:[{id:"formation",organisation_id:ids.org,title:"Formation exemple",status:"validated",version:1}],
  daily_registration_responses:[],daily_formation_registration_requests:[],daily_documents:[],daily_communications:[],daily_session_followup_entries:[],daily_learning_assessments:[],daily_learner_feedback_responses:[],daily_session_dossiers:[],daily_portal_access_tokens:[]};
 const reads=[],logs=[],scopes=[],effects=[],redirects=[];
 function project(row,columns) {
  if(!columns||columns==="*")return structuredClone(row);
  const result={};let depth=0,start=0,parts=[];
  for(let i=0;i<=columns.length;i++){const c=columns[i];if(c==="(")depth++;if(c===")")depth--;if(i===columns.length||(c===","&&depth===0)){parts.push(columns.slice(start,i));start=i+1;}}
  for(const field of parts){const key=field.split("(")[0];if(!Object.hasOwn(row,key))continue;const nested=field.indexOf("(");const value=row[key];result[key]=nested<0?structuredClone(value):Array.isArray(value)?value.map(v=>project(v,field.slice(nested+1,-1))):value?project(value,field.slice(nested+1,-1)):null;}
  return result;
 }
 const admin={from(table){
  assert.ok(Object.hasOwn(db,table),"Unexpected table "+table);let filters=[],one=false,columns;
  const q={select(v){columns=v;return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},neq(k,v){filters.push(r=>r[k]!==v);return q;},
   in(k,v){filters.push(r=>v.includes(r[k]));return q;},not(k,op,v){assert.equal(op,"in");filters.push(r=>!v.slice(1,-1).split(",").includes(r[k]));return q;},
   order(){return q;},limit(){return q;},maybeSingle(){one=true;return q;},single(){one=true;return q;},
   insert(){throw Error("Business write forbidden");},update(){throw Error("Business write forbidden");},upsert(){throw Error("Business write forbidden");},delete(){throw Error("Business write forbidden");},
   then(resolve,reject){return Promise.resolve().then(()=>{reads.push({table,columns});if(options.failTable===table)return{data:null,error:{message:"fixture read failure"}};
    let rows=db[table].filter(r=>filters.every(f=>f(r))).map(r=>table==="daily_attendance_slots"?{...r,daily_attendance_records:db.daily_attendance_records.filter(v=>v.slot_id===r.id)}:r);
    rows=rows.map(r=>project(r,columns));return{data:one?rows[0]??null:rows,error:null};}).then(resolve,reject);}};
  return q;
 }};
 const context={ok:true,admin,organisationId:ids.org,assisted:options.assisted!==false,assistance:{id:"assistance",organisation_id:ids.org}};
 const workspace={ok:true,user:{id:"manager",email:"manager@example.test"},workspace:{trainers:db.daily_trainer_profiles,membership:{organisation_id:ids.org,roles:["manager"]},capabilities:{sessions:true,trainers:true}}};
 const cache={};
 function load(path,extra={}) {
  if(cache[path]&&!Object.keys(extra).length)return cache[path];const module={exports:{}};
  const dependencies={
   "react":React,"react/jsx-runtime":jsx,"next/link":{__esModule:true,default:({children,...props})=>React.createElement("a",props,children)},
   "next/server":{NextResponse:{json:Response.json}},
   "@/lib/server/dailyOrganisationContext":{getDailyOrganisationReadContext:async()=>context},
   "@/lib/server/dailyClientWorkspace":{getDailyClientWorkspace:async()=>workspace},
   "@/lib/server/clientNdaAccess":{getAdminSupabase:()=>admin},
   "@/lib/server/agentAssistance":{logAgentAssistanceAction:async input=>logs.push(input)},
   "@/lib/server/dailyAttendance":{attendanceParisClock:()=>({date:"2026-10-13",minutes:900})},
   "@/components/agent/AttendanceRegularizationLink":{__esModule:true,default:()=>null},
   "@/lib/vitrineLinks":{getVitrineBaseUrl:()=>"https://www.selen-editions.fr"},
   "@/lib/server/supabaseAdmin":{createSupabaseAdminClient:()=>admin},
   "@/app/agent/api/support/_utils":{requireSupportAgent:async()=>({ok:true,email:"agent@example.test"})},
   "@/lib/server/dailyOrganisationScope":{isDailyOrganisationInAgentScope:async(email,org)=>{scopes.push({email,org});return options.outOfScope!==true&&org===ids.org;}},
   ...extra};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,"utf8"),{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{
   module,exports:module.exports,URL,Date,Intl,Error,console,window:options.window,fetch(){throw Error("Real network forbidden");},
   require(name){if(Object.hasOwn(dependencies,name))return dependencies[name];if(name==="@/lib/server/dailyAssistedTrainerWorkspace")return load("lib/server/dailyAssistedTrainerWorkspace.ts");if(name==="@/lib/dailyAttendanceState")return load("lib/dailyAttendanceState.ts");if(name==="@/lib/daily/attendanceRegularizationLink")return load("src/lib/daily/attendanceRegularizationLink.ts");throw Error("Unexpected dependency "+name);}
  },{filename:path});
  if(!Object.keys(extra).length)cache[path]=module.exports;return module.exports;
 }
 return{db,trainer,session,enrolment,context,workspace,admin,reads,logs,scopes,effects,redirects,load};
}
