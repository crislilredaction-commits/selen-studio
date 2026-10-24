import { isDailyOrganisationInAgentScope } from "@/lib/server/dailyOrganisationScope";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export type AttendanceReviewDecision = "validate" | "reject";
type ReviewRecord = { id:string; organisation_id:string; session_id:string; slot_id:string; enrolment_id:string; status:string|null; signed_at:string|null; evidence_metadata:Record<string,unknown>|null; updated_at:string };
type ReviewInput = { agentEmail:string; reviewerUserId:string; sessionId:string; slotId:string; enrolmentId:string; decision:AttendanceReviewDecision; reason?:string };
type ReviewDeps = { load:(input:ReviewInput)=>Promise<ReviewRecord|null>; inScope:(email:string,organisationId:string)=>Promise<boolean>; commit:(record:ReviewRecord,patch:Record<string,unknown>)=>Promise<boolean>; now:()=>string };
function text(value:unknown){return typeof value==="string"?value.trim():""}

export function buildDailyAttendanceReviewPatch(record:ReviewRecord,input:ReviewInput,decidedAt:string){
 const metadata=record.evidence_metadata&&typeof record.evidence_metadata==="object"?record.evidence_metadata:{};
 const review=metadata.late_review&&typeof metadata.late_review==="object"?metadata.late_review as Record<string,unknown>:{};
 if(metadata.late_attendance!==true||record.status!=="pending"||!record.signed_at||review.state!=="awaiting_validation")return{ok:false as const,status:409,error:"Cette régularisation n’est plus en attente de validation."};
 const reason=text(input.reason);if(input.decision==="reject"&&reason.length<3)return{ok:false as const,status:400,error:"Le motif du rejet est obligatoire."};
 const version=Number(review.version)||1;
 const versions=(Array.isArray(review.versions)?review.versions:[]).map(item=>!item||typeof item!=="object"||Number((item as Record<string,unknown>).version)!==version?item:{...(item as Record<string,unknown>),decision:input.decision==="validate"?"validated":"rejected",decided_at:decidedAt,decided_by:input.reviewerUserId,decided_by_email:input.agentEmail,reason:input.decision==="reject"?reason:null});
 const nextMetadata={...metadata,late_review:{...review,state:input.decision==="validate"?"validated":"rejected",rejection_reason:input.decision==="reject"?reason:null,decided_at:decidedAt,decided_by:input.reviewerUserId,decided_by_email:input.agentEmail,reviewer_mode:"studio_assignment",versions}};
 return{ok:true as const,version,reviewState:input.decision==="validate"?"validated":"rejected",patch:input.decision==="validate"?{status:"present",validated_at:decidedAt,validated_by:input.reviewerUserId,evidence_metadata:nextMetadata,updated_at:decidedAt}:{status:"pending",validated_at:null,validated_by:null,evidence_metadata:nextMetadata,updated_at:decidedAt}};
}

export async function reviewDailyAttendanceEvidenceWithDeps(input:ReviewInput,deps:ReviewDeps){
 if(!input.reviewerUserId||!text(input.agentEmail)||!["validate","reject"].includes(input.decision))return{ok:false as const,status:400,error:"Décision de validation invalide."};
 const record=await deps.load(input);if(!record)return{ok:false as const,status:404,error:"Émargement introuvable."};
 if(!await deps.inScope(input.agentEmail,record.organisation_id))return{ok:false as const,status:403,error:"Accès refusé."};
 const built=buildDailyAttendanceReviewPatch(record,input,deps.now());if(!built.ok)return built;
 if(!await deps.commit(record,built.patch))return{ok:false as const,status:409,error:"La régularisation a changé entre-temps. Rechargez la page."};
 return{ok:true as const,reviewState:built.reviewState,version:built.version};
}

export async function reviewDailyAttendanceEvidence(input:ReviewInput){
 const admin=createSupabaseAdminClient();
 return reviewDailyAttendanceEvidenceWithDeps(input,{inScope:isDailyOrganisationInAgentScope,now:()=>new Date().toISOString(),load:async ids=>{const{data,error}=await admin.from("daily_attendance_records").select("id,organisation_id,session_id,slot_id,enrolment_id,status,signed_at,evidence_metadata,updated_at").eq("session_id",ids.sessionId).eq("slot_id",ids.slotId).eq("enrolment_id",ids.enrolmentId).maybeSingle();if(error)throw new Error(error.message);return data as ReviewRecord|null},commit:async(record,patch)=>{const{data,error}=await admin.from("daily_attendance_records").update(patch).eq("id",record.id).eq("organisation_id",record.organisation_id).eq("session_id",record.session_id).eq("slot_id",record.slot_id).eq("enrolment_id",record.enrolment_id).eq("updated_at",record.updated_at).select("id").maybeSingle();if(error)throw new Error(error.message);return Boolean(data)}});
}
