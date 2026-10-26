import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isolatedTsModule } from "./helpers/isolatedTsModule.mjs";
const [source,route,page,historySource,timeline,communications,pdf]=await Promise.all([
 readFile(new URL("../src/lib/server/dailyAttendanceHumanReview.ts",import.meta.url),"utf8"),
 readFile(new URL("../src/app/agent/api/daily/attendance-regularization/review/route.ts",import.meta.url),"utf8"),
 readFile(new URL("../src/app/agent/daily/session-dossiers/[id]/full/page.tsx",import.meta.url),"utf8"),
 readFile(new URL("../src/lib/daily/attendanceReviewHistory.ts",import.meta.url),"utf8"),
 readFile(new URL("../src/app/agent/daily/session-dossiers/[id]/timeline/page.tsx",import.meta.url),"utf8"),
 readFile(new URL("../src/app/agent/daily/communications/page.tsx",import.meta.url),"utf8"),
 readFile(new URL("../src/app/agent/daily/session-dossiers/[id]/attendance/pdf/route.ts",import.meta.url),"utf8"),
]);
const reviewModule=isolatedTsModule("src/lib/server/dailyAttendanceHumanReview.ts",{"@/lib/server/dailyOrganisationScope":{isDailyOrganisationInAgentScope:async()=>false},"@/lib/server/supabaseAdmin":{createSupabaseAdminClient:()=>({})}},{Array,Boolean,Date,Number,Object,String});
const historyModule=isolatedTsModule("src/lib/daily/attendanceReviewHistory.ts",{},{Array,Boolean,Map,Number,Object,String});
const baseRecord={id:"record",organisation_id:"of-a",session_id:"session",slot_id:"slot",enrolment_id:"enrolment",status:"pending",signed_at:"2026-10-24T00:10:00.000Z",updated_at:"2026-10-24T00:10:00.000Z",evidence_metadata:{late_attendance:true,proof_sha256:"hash",late_review:{state:"awaiting_validation",version:2,versions:[{version:1,decision:"rejected"},{version:2,state:"awaiting_validation",submitted_at:"2026-10-24T00:10:00.000Z"}]}}};
const input={agentEmail:"agent@example.test",reviewerUserId:"reviewer",sessionId:"session",slotId:"slot",enrolmentId:"enrolment",decision:"validate"};
function deps(overrides={}){const commits=[];return{commits,value:{load:async()=>structuredClone(baseRecord),inScope:async()=>true,commit:async(_record,patch)=>{commits.push(patch);return true},now:()=>"2026-10-24T01:00:00.000Z",...overrides}}}
test("Studio valide uniquement la version en attente et conserve tout l’historique",async()=>{const h=deps(),result=await reviewModule.reviewDailyAttendanceEvidenceWithDeps(input,h.value);assert.deepEqual({...result},{ok:true,reviewState:"validated",version:2});assert.equal(h.commits[0].status,"present");assert.equal(h.commits[0].validated_by,"reviewer");assert.equal(h.commits[0].evidence_metadata.proof_sha256,"hash");const versions=h.commits[0].evidence_metadata.late_review.versions;assert.equal(versions.length,2);assert.equal(versions[0].decision,"rejected");assert.equal(versions[1].decision,"validated");assert.equal(versions[1].submitted_at,"2026-10-24T00:10:00.000Z")});
test("Studio rejette avec motif, garde la date réelle et rouvre le cycle",async()=>{const h=deps(),result=await reviewModule.reviewDailyAttendanceEvidenceWithDeps({...input,decision:"reject",reason:"Preuve illisible"},h.value);assert.equal(result.reviewState,"rejected");assert.equal(h.commits[0].status,"pending");assert.equal(h.commits[0].validated_at,null);assert.equal(h.commits[0].evidence_metadata.late_review.rejection_reason,"Preuve illisible");assert.equal(h.commits[0].evidence_metadata.late_review.versions[1].reason,"Preuve illisible");assert.equal(baseRecord.signed_at,"2026-10-24T00:10:00.000Z")});
test("un agent hors affectation ne peut prendre aucune décision",async()=>{const h=deps({inScope:async()=>false}),result=await reviewModule.reviewDailyAttendanceEvidenceWithDeps(input,h.value);assert.equal(result.status,403);assert.equal(h.commits.length,0)});
test("un état périmé ou une concurrence bloque avant écriture",async()=>{const stale=deps({load:async()=>({...baseRecord,evidence_metadata:{...baseRecord.evidence_metadata,late_review:{state:"rejected",version:2}}})});assert.equal((await reviewModule.reviewDailyAttendanceEvidenceWithDeps(input,stale.value)).status,409);assert.equal(stale.commits.length,0);const raced=deps({commit:async()=>false});assert.match((await reviewModule.reviewDailyAttendanceEvidenceWithDeps(input,raced.value)).error,/changé entre-temps/)});
test("la route et le détail authentifié branchent le contrôle sans élargir le périmètre",()=>{assert.match(route,/requireSupportAgent/);assert.match(source,/isDailyOrganisationInAgentScope/);for(const key of["organisation_id","session_id","slot_id","enrolment_id","updated_at"])assert.match(source,new RegExp(`\\.eq\\(\"${key}\"`));assert.match(page,/AttendanceHumanReview/);assert.match(page,/reviewState===\"awaiting_validation\"/)});
test("la projection d’audit conserve les cycles successifs et exclut les secrets",()=>{
 const entries=historyModule.getAttendanceReviewHistory({signed_at:"2026-10-24T02:00:00.000Z",evidence_metadata:{late_attendance:true,access_token:"secret",signature_storage_path:"private/path",late_review:{state:"rejected",version:2,decided_by:"user-id",decided_by_email:"agent@example.test",rejection_reason:"Page illisible",decided_at:"2026-10-24T03:00:00.000Z",versions:[{version:1,decision:"rejected",submitted_at:"2026-10-23T20:00:00.000Z",decided_at:"2026-10-23T21:00:00.000Z",reason:"Signature absente",decided_by_email:"first@example.test"},{version:2,state:"awaiting_validation",submitted_at:"2026-10-24T02:00:00.000Z",storage_path:"private/v2"}]}}});
 assert.deepEqual(JSON.parse(JSON.stringify(entries)),[
  {version:1,state:"rejected",submittedAt:"2026-10-23T20:00:00.000Z",decidedAt:"2026-10-23T21:00:00.000Z",reason:"Signature absente"},
  {version:2,state:"rejected",submittedAt:"2026-10-24T02:00:00.000Z",decidedAt:"2026-10-24T03:00:00.000Z",reason:"Page illisible"},
 ]);
 const serialized=JSON.stringify(entries);
 for(const secret of["secret","private/path","private/v2","user-id","agent@example.test","first@example.test"])assert.equal(serialized.includes(secret),false);
});
test("la chronologie, les preuves et le PDF réutilisent la projection sûre",()=>{
 for(const surface of[timeline,communications,pdf])assert.match(surface,/getAttendanceReviewHistory/);
 assert.match(timeline,/Historique des revues d’émargement/);
 assert.match(communications,/Preuves de revue des émargements/);
 assert.match(communications,/getDailyOrganisationIdsForAgent\(auth\.email\)/); assert.match(communications,/\.in\("organisation_id", dailyOrganisationIds\)/);
 assert.match(pdf,/Revue v\$\{review\.version\}/);
 for(const privateKey of["decided_by_email","reviewerUserId","access_token"])assert.doesNotMatch(historySource,new RegExp(privateKey));
});
