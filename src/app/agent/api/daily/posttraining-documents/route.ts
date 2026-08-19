import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

const posttrainingTypes=["attendance_summary","completion_certificate"];
const reviewTypes=[...posttrainingTypes,"learning_assessment_evidence"];

async function fallbackSyncChecklist(admin:ReturnType<typeof createSupabaseAdminClient>,sessionId:string){
  const [{data:enrolments},{data:slots},{data:records},{data:docs}]=await Promise.all([
    admin.from("daily_session_enrolments").select("id,status").eq("session_id",sessionId).not("status","in",'(declined,cancelled)'),
    admin.from("daily_attendance_slots").select("id,status").eq("session_id",sessionId).neq("status","cancelled"),
    admin.from("daily_attendance_records").select("enrolment_id,slot_id,status").eq("session_id",sessionId),
    admin.from("daily_documents").select("document_type,linked_object_type,linked_object_id,status").in("document_type",posttrainingTypes).eq("is_current",true),
  ]);
  const activeEnrolments=enrolments??[];
  const activeSlots=slots??[];
  const activeEnrolmentIds=new Set(activeEnrolments.map((row)=>row.id));
  const activeSlotIds=new Set(activeSlots.map((row)=>row.id));
  const relevantRecords=(records??[]).filter((row)=>activeEnrolmentIds.has(row.enrolment_id)&&activeSlotIds.has(row.slot_id));
  const expectedRecords=activeEnrolments.length*activeSlots.length;
  const settledRecords=relevantRecords.filter((row)=>row.status!=="pending").length;
  const eligibleIds=new Set(relevantRecords.filter((row)=>row.status==="present").map((row)=>row.enrolment_id));
  const expectedDocuments=activeSlots.length>0&&settledRecords===expectedRecords?1+eligibleIds.size:activeSlots.length>0?1:0;
  const current=(docs??[]).filter((doc)=>
    (doc.document_type==="attendance_summary"&&doc.linked_object_type==="session"&&doc.linked_object_id===sessionId)||
    (doc.document_type==="completion_certificate"&&doc.linked_object_type==="enrolment"&&eligibleIds.has(doc.linked_object_id)),
  );
  const validated=current.filter((doc)=>doc.status==="validated").length;
  let status="todo";
  let note="Aucun créneau de présence disponible pour préparer les documents de fin.";
  if(activeSlots.length>0&&expectedRecords>0&&settledRecords<expectedRecords){
    status=settledRecords>0||current.length>0?"in_progress":"todo";
    note=`${settledRecords}/${expectedRecords} présence(s) finalisée(s) avant génération des documents de fin.`;
  }else if(activeSlots.length>0&&current.length===0){
    note=`${expectedDocuments} document(s) de fin attendu(s).`;
  }else if(current.length<expectedDocuments){
    status="in_progress";
    note=`${current.length}/${expectedDocuments} document(s) de fin préparé(s).`;
  }else if(validated<expectedDocuments){
    status="to_review";
    note=`${current.length}/${expectedDocuments} document(s) de fin préparé(s), contrôle Selen requis.`;
  }else if(expectedDocuments>0){
    status="validated";
    note=`${expectedDocuments} document(s) de fin validé(s).`;
  }
  await admin.from("daily_session_checklist_items").update({status,note}).eq("session_id",sessionId).eq("item_key","posttraining_documents").neq("status","not_applicable");
}

async function syncChecklist(admin:ReturnType<typeof createSupabaseAdminClient>,sessionId:string){
  const {error}=await admin.rpc("daily_sync_session_posttraining_checklist",{p_session_id:sessionId});
  if(error)await fallbackSyncChecklist(admin,sessionId);
}

export async function GET(){
 const auth=await requireSupportAgent();if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});const admin=createSupabaseAdminClient();const {data,error}=await admin.from("daily_documents").select("*,organisations(name)").in("document_type",reviewTypes).eq("is_current",true).order("created_at",{ascending:false});if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({documents:data??[]});
}

export async function PATCH(req:Request){
 const auth=await requireSupportAgent();if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});const body=await req.json().catch(()=>({}));const id=String(body.id??"");const action=String(body.action??"");const note=typeof body.note==="string"?body.note.trim():"";if(!id||!["validate","request_correction"].includes(action))return NextResponse.json({error:"Action invalide."},{status:400});
 const supabase=await createClient();const {data:userData}=await supabase.auth.getUser();const userId=userData.user?.id;if(!userId)return NextResponse.json({error:"Utilisateur introuvable."},{status:401});const admin=createSupabaseAdminClient();const {data:current,error:readError}=await admin.from("daily_documents").select("id,status,metadata,document_type").eq("id",id).in("document_type",reviewTypes).eq("is_current",true).single();if(readError||!current)return NextResponse.json({error:"Document introuvable."},{status:404});
 const metadata={...(current.metadata??{}),review_note:note||null,reviewed_at:new Date().toISOString(),reviewed_by_email:auth.email};const updates=action==="validate"?{status:"validated",validated_by:userId,validated_at:new Date().toISOString(),updated_by:userId,metadata}:{status:"correction_requested",validated_by:null,validated_at:null,updated_by:userId,metadata};const {data,error}=await admin.from("daily_documents").update(updates).eq("id",id).select("*").single();if(error)return NextResponse.json({error:error.message},{status:400});const sessionId=typeof metadata.session_id==="string"?metadata.session_id:"";if(sessionId&&posttrainingTypes.includes(current.document_type))await syncChecklist(admin,sessionId);return NextResponse.json({document:data});
}
