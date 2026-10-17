import { isOverdueAfterBusinessHours } from "@/lib/franceBusinessTime";
import { isSignatureTerminal } from "@/lib/daily/signatureReminder24h";
import { getDailyAttendanceClientFollowups } from "@/lib/server/dailyAttendanceClientFollowups";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export type FollowupStaff = { id: string | null; role: "agent" | "admin" };
export type StudioClientFollowup = { id:string; title:string; detail:string; href:string; dueAt:string|null; assignedAgentProfileId:string|null; overdueShared:boolean; reminderType:string|null; isDaily:boolean };
type ReminderRow = { id:string; client_email:string|null; dossier_id:string|null; reminder_type:string|null; subject:string|null; due_at:string|null; metadata:Record<string,unknown>|null };
type DailySessionRow = { id:string; status:string|null };
type DailyEnrolmentRow = { id:string; session_id:string; status:string|null };
type DailySignatureRow = { id:string; session_id:string; convention_id:string; status:string|null; signed_at:string|null };
export type DailyReminderCanonicalState = {
 sessions:ReadonlyMap<string,DailySessionRow>;
 enrolments:ReadonlyMap<string,DailyEnrolmentRow>;
 signatures:ReadonlyMap<string,DailySignatureRow>;
};
const AGENT_SHARED_AFTER_BUSINESS_HOURS=24;
const SIGNATURE_REMINDER="daily_signature_pending_72h";
const SIGNATURE_J3_STAGE="automatic_email_j3";
const SIGNATURE_J6_STAGE="automatic_email_j6";
const SIGNATURE_J9_STAGE="phone_call_j9";
const SIGNATURE_URGENT_STAGE="agent_urgent_before_start";
const TERMINAL_SESSION_STATUSES=new Set(["archived","cancelled","canceled","deleted","removed"]);
const TERMINAL_ENROLMENT_STATUSES=new Set(["declined","cancelled","canceled","abandoned","completed"]);
function text(value:unknown){return typeof value==="string"?value.trim():""}
function normalizedStatus(value:unknown){return text(value).toLowerCase()}
function isOverdue(value:string|null){return isOverdueAfterBusinessHours(value,AGENT_SHARED_AFTER_BUSINESS_HOURS)}
function isDue(value:string|null){if(!value)return true;const time=new Date(value).getTime();return Number.isFinite(time)&&time<=Date.now()}
function assignedAgent(metadata:Record<string,unknown>|null){return text(metadata?.assigned_agent_profile_id||metadata?.agent_profile_id)||null}
function followupStage(row:ReminderRow){return text(row.metadata?.followup_stage)}
function queuedAt(row:ReminderRow){if(row.reminder_type===SIGNATURE_REMINDER&&[SIGNATURE_J9_STAGE,SIGNATURE_URGENT_STAGE].includes(followupStage(row)))return row.due_at;return text(row.metadata?.queued_at||row.metadata?.created_at||row.metadata?.first_due_at)||row.due_at}
function dailyReminder(row:ReminderRow){const source=text(row.metadata?.source||row.metadata?.domain||row.metadata?.product||row.metadata?.scope).toLowerCase();return source.includes("daily")||String(row.reminder_type??"").toLowerCase().startsWith("daily_")}
function metadataId(row:ReminderRow,key:string,alternateKey?:string){return text(row.metadata?.[key]||(alternateKey?row.metadata?.[alternateKey]:null))}
function canonicalDailyReminderActive(row:ReminderRow,state:DailyReminderCanonicalState){
 if(!dailyReminder(row))return true;
 const sessionId=metadataId(row,"session_id");
 const enrolmentId=metadataId(row,"enrolment_id","enrollment_id");
 const signatureId=metadataId(row,"signature_id");
 const conventionId=metadataId(row,"convention_id");
 if(row.reminder_type===SIGNATURE_REMINDER&&(!sessionId||!signatureId||!conventionId))return false;
 if(sessionId){
  const session=state.sessions.get(sessionId);
  if(!session||!normalizedStatus(session.status)||TERMINAL_SESSION_STATUSES.has(normalizedStatus(session.status)))return false;
 }
 if(enrolmentId){
  const enrolment=state.enrolments.get(enrolmentId);
  if(!enrolment||!normalizedStatus(enrolment.status)||TERMINAL_ENROLMENT_STATUSES.has(normalizedStatus(enrolment.status))||(sessionId&&enrolment.session_id!==sessionId))return false;
 }
 if(signatureId){
  const signature=state.signatures.get(signatureId);
  if(!signature||!normalizedStatus(signature.status)||isSignatureTerminal(signature.status,signature.signed_at)||(sessionId&&signature.session_id!==sessionId)||(conventionId&&signature.convention_id!==conventionId))return false;
  if(enrolmentId&&state.enrolments.get(enrolmentId)?.session_id!==signature.session_id)return false;
 }
 return true;
}
function visible(row:ReminderRow,staff:FollowupStaff,overdueShared:boolean){if(staff.role==="admin")return true;const agentId=assignedAgent(row.metadata);if(!agentId)return true;return staff.id===agentId||overdueShared}
function exactMetadataHref(row:ReminderRow){
 const href=text(row.metadata?.action_href||row.metadata?.target_href||row.metadata?.studio_href);
 return href.startsWith("/agent/")?href:null;
}
function followupHref(row:ReminderRow,isDaily:boolean){
 const exactHref=exactMetadataHref(row);
 if(exactHref)return exactHref;
 const sessionId=text(row.metadata?.session_id);
 if(isDaily&&sessionId){
  const encoded=encodeURIComponent(sessionId),type=String(row.reminder_type??"").toLowerCase();
  if(type.includes("satisfaction"))return `/agent/daily/session-dossiers/${encoded}/satisfaction`;
  if(type.includes("registration")||type.includes("inscription"))return `/agent/daily/sessions/${encoded}`;
  if(type.includes("attendance")||type.includes("emarg")||type.includes("signature"))return `/agent/daily/session-dossiers/${encoded}/attendance`;
  if(type.includes("document")||type.includes("piece"))return `/agent/daily/session-dossiers/${encoded}/documents`;
  return `/agent/daily/session-dossiers/${encoded}/full`;
 }
 return row.dossier_id?`/agent/dossiers/${row.dossier_id}`:"/agent/relances";
}
export function buildStudioReminderFollowups(rows:ReminderRow[],staff:FollowupStaff,state:DailyReminderCanonicalState,options?:{dailyOnly?:boolean}){
 return rows.flatMap((row):StudioClientFollowup[]=>{
  if(row.reminder_type===SIGNATURE_REMINDER&&[SIGNATURE_J3_STAGE,SIGNATURE_J6_STAGE].includes(followupStage(row)))return[];
  if(!isDue(row.due_at))return[];
  const overdueShared=isOverdue(queuedAt(row)),isDaily=dailyReminder(row);
  if((options?.dailyOnly&&!isDaily)||!visible(row,staff,overdueShared)||!canonicalDailyReminderActive(row,state))return[];
  return[{id:row.id,title:row.client_email||"Partie prenante à relancer",detail:text(row.metadata?.expected_action||row.metadata?.reason)||row.subject||"Relance à traiter",href:followupHref(row,isDaily),dueAt:row.due_at,assignedAgentProfileId:assignedAgent(row.metadata),overdueShared,reminderType:row.reminder_type,isDaily}];
 });
}
function uniqueMetadataIds(rows:ReminderRow[],key:string,alternateKey?:string){return [...new Set(rows.map((row)=>metadataId(row,key,alternateKey)).filter(Boolean))]}
function byId<T extends {id:string}>(rows:T[]|null){return new Map((rows??[]).map((row)=>[row.id,row]))}
const FOLLOWUP_PAGE_SIZE=500;
async function fetchAllClientReminders(admin:ReturnType<typeof createSupabaseAdminClient>):Promise<ReminderRow[]>{
 const rows:ReminderRow[]=[];
 for(let offset=0;;offset+=FOLLOWUP_PAGE_SIZE){
  const {data,error}=await admin.from("client_reminders")
   .select("id,client_email,dossier_id,reminder_type,status,subject,due_at,metadata")
   .in("status",["draft","ready","postponed"])
   .order("due_at",{ascending:true}).order("id",{ascending:true})
   .range(offset,offset+FOLLOWUP_PAGE_SIZE-1);
  if(error)throw new Error(`Relances clients indisponibles : ${error.message}`);
  const page=(data??[]) as ReminderRow[];
  rows.push(...page);
  if(page.length<FOLLOWUP_PAGE_SIZE)return rows;
 }
}
export async function getStudioClientFollowups(staff:FollowupStaff,options?:{dailyOnly?:boolean}){
 const admin=createSupabaseAdminClient();
 const [rows,attendanceFollowups]=await Promise.all([
  fetchAllClientReminders(admin),
  getDailyAttendanceClientFollowups(staff),
 ]);
 const dailyRows=rows.filter(dailyReminder);
 const sessionIds=uniqueMetadataIds(dailyRows,"session_id");
 const enrolmentIds=uniqueMetadataIds(dailyRows,"enrolment_id","enrollment_id");
 const signatureIds=uniqueMetadataIds(dailyRows,"signature_id");
 const empty={data:[],error:null};
 const[sessionsResult,enrolmentsResult,signaturesResult]=await Promise.all([
  sessionIds.length?admin.from("daily_sessions").select("id,status").in("id",sessionIds):Promise.resolve(empty),
  enrolmentIds.length?admin.from("daily_session_enrolments").select("id,session_id,status").in("id",enrolmentIds):Promise.resolve(empty),
  signatureIds.length?admin.from("daily_convention_signatures").select("id,session_id,convention_id,status,signed_at").in("id",signatureIds):Promise.resolve(empty),
 ]);
 const canonicalError=sessionsResult.error||enrolmentsResult.error||signaturesResult.error;
 if(canonicalError)throw new Error(`Relances Daily indisponibles : ${canonicalError.message}`);
 const canonicalState:DailyReminderCanonicalState={
  sessions:byId((sessionsResult.data??[]) as DailySessionRow[]),
  enrolments:byId((enrolmentsResult.data??[]) as DailyEnrolmentRow[]),
  signatures:byId((signaturesResult.data??[]) as DailySignatureRow[]),
 };
 const reminderFollowups=buildStudioReminderFollowups(rows,staff,canonicalState,options);
 return [...reminderFollowups,...attendanceFollowups].filter((row)=>!options?.dailyOnly||row.isDaily).sort((left,right)=>Date.parse(left.dueAt??"")-Date.parse(right.dueAt??""));
}
