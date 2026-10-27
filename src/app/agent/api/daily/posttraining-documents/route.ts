import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";
import { publishDailyDocumentAndNotify } from "@/lib/server/dailyDocumentPublication";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

const types=["attendance_summary","completion_certificate"];

async function fallbackSyncChecklist(admin:ReturnType<typeof createSupabaseAdminClient>,sessionId:string){
  const [{data:enrolments},{data:slots},{data:records},{data:docs}]=await Promise.all([
    admin.from("daily_session_enrolments").select("id,status").eq("session_id",sessionId).not("status","in",'(declined,cancelled,abandoned)'),
    admin.from("daily_attendance_slots").select("id,status").eq("session_id",sessionId).neq("status","cancelled"),
    admin.from("daily_attendance_records").select("enrolment_id,slot_id,status").eq("session_id",sessionId),
    admin.from("daily_documents").select("document_type,linked_object_type,linked_object_id,status").in("document_type",types).eq("is_current",true),
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
  // A published (or subsequently signed/activated) document has already passed
  // review. The fallback must preserve the validated checklist state if the RPC
  // is temporarily unavailable instead of reopening work after publication.
  const reviewed=current.filter((doc)=>["validated","published","signed","active"].includes(doc.status)).length;
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
  }else if(reviewed<expectedDocuments){
    status="to_review";
    note=`${current.length}/${expectedDocuments} document(s) de fin préparé(s), contrôle Selen requis.`;
  }else if(expectedDocuments>0){
    status="validated";
    note=`${expectedDocuments} document(s) de fin validé(s).`;
  }
  const {error}=await admin.from("daily_session_checklist_items").update({status,note}).eq("session_id",sessionId).eq("item_key","posttraining_documents").neq("status","not_applicable");
  if(error)throw new Error(`Impossible de synchroniser le suivi des documents de fin : ${error.message}`);
}

async function syncChecklist(admin:ReturnType<typeof createSupabaseAdminClient>,sessionId:string){
  const {error}=await admin.rpc("daily_sync_session_posttraining_checklist",{p_session_id:sessionId});
  if(error)await fallbackSyncChecklist(admin,sessionId);
}

export async function GET(){
  const auth=await requireSupportAgent();
  if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
  const organisationIds=await getDailyOrganisationIdsForAgent(auth.email);
  if(organisationIds.length===0)return NextResponse.json({documents:[]});
  const admin=createSupabaseAdminClient();
  const {data,error}=await admin
    .from("daily_documents")
    .select("*,organisations(name)")
    .in("organisation_id",organisationIds)
    .in("document_type",types)
    .eq("is_current",true)
    .order("created_at",{ascending:false});
  if(error)return NextResponse.json({error:error.message},{status:500});
  const documents=data??[];
  const directSessionIds=[...new Set(documents
    .filter((document)=>document.document_type==="attendance_summary"&&document.linked_object_type==="session")
    .map((document)=>document.linked_object_id))];
  const enrolmentIds=[...new Set(documents
    .filter((document)=>document.document_type==="completion_certificate"&&document.linked_object_type==="enrolment")
    .map((document)=>document.linked_object_id))];
  const [{data:sessions,error:sessionError},{data:enrolments,error:enrolmentError}]=await Promise.all([
    directSessionIds.length
      ? admin.from("daily_sessions").select("id,status").in("id",directSessionIds).in("organisation_id",organisationIds)
      : Promise.resolve({data:[],error:null}),
    enrolmentIds.length
      ? admin.from("daily_session_enrolments").select("id,status,session_id,daily_sessions!inner(status)").in("id",enrolmentIds).in("organisation_id",organisationIds)
      : Promise.resolve({data:[],error:null}),
  ]);
  if(sessionError||enrolmentError)return NextResponse.json({error:(sessionError??enrolmentError)?.message},{status:500});
  const activeSessions=new Set((sessions??[]).filter((session)=>!["cancelled","archived"].includes(session.status)).map((session)=>session.id));
  const activeEnrolments=new Set((enrolments??[]).filter((enrolment)=>{
    const parent=Array.isArray(enrolment.daily_sessions)?enrolment.daily_sessions[0]:enrolment.daily_sessions;
    return !["declined","cancelled","abandoned"].includes(enrolment.status)&&parent&&!['cancelled','archived'].includes(parent.status);
  }).map((enrolment)=>enrolment.id));
  return NextResponse.json({documents:documents.filter((document)=>(
    document.document_type==="attendance_summary"
      ? document.linked_object_type==="session"&&activeSessions.has(document.linked_object_id)
      : document.linked_object_type==="enrolment"&&activeEnrolments.has(document.linked_object_id)
  ))});
}

export async function PATCH(req:Request){
  const auth=await requireSupportAgent();
  if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
  const body=await req.json().catch(()=>({}));
  const id=String(body.id??"");
  const action=String(body.action??"");
  const note=typeof body.note==="string"?body.note.trim():"";
  const expectedUpdatedAt=typeof body.expected_updated_at==="string"?body.expected_updated_at:"";
  const expectedStatus=typeof body.expected_status==="string"?body.expected_status:"";
  const expectedVersion=Number(body.expected_version);
  if(!id||!["validate","request_correction","publish"].includes(action)||!expectedUpdatedAt||!expectedStatus||!Number.isInteger(expectedVersion))return NextResponse.json({error:"Action invalide ou version affichée manquante."},{status:400});
  const supabase=await createClient();
  const {data:userData}=await supabase.auth.getUser();
  const userId=userData.user?.id;
  if(!userId)return NextResponse.json({error:"Utilisateur introuvable."},{status:401});
  const organisationIds=await getDailyOrganisationIdsForAgent(auth.email);
  if(organisationIds.length===0)return NextResponse.json({error:"Document introuvable."},{status:404});
  const admin=createSupabaseAdminClient();
  const {data:current,error:readError}=await admin
    .from("daily_documents")
    .select("id,status,metadata,organisation_id,document_type,logical_name,version,linked_object_type,linked_object_id,updated_at,sha256")
    .eq("id",id)
    .in("organisation_id",organisationIds)
    .in("document_type",types)
    .eq("is_current",true)
    .single();
  if(readError||!current)return NextResponse.json({error:"Document introuvable."},{status:404});
  if(current.updated_at!==expectedUpdatedAt||current.status!==expectedStatus||current.version!==expectedVersion){
    return NextResponse.json({error:"La pièce a changé depuis son affichage. Recharge la file puis ouvre de nouveau la version courante."},{status:409});
  }

  let parentActive=false;
  if(current.document_type==="attendance_summary"&&current.linked_object_type==="session"){
    const {data:session,error}=await admin.from("daily_sessions").select("id,status").eq("id",current.linked_object_id).eq("organisation_id",current.organisation_id).maybeSingle();
    if(error)return NextResponse.json({error:error.message},{status:500});
    parentActive=Boolean(session&&!['cancelled','archived'].includes(session.status));
  }else if(current.document_type==="completion_certificate"&&current.linked_object_type==="enrolment"){
    const {data:enrolment,error}=await admin.from("daily_session_enrolments").select("id,status,daily_sessions!inner(status)").eq("id",current.linked_object_id).eq("organisation_id",current.organisation_id).maybeSingle();
    if(error)return NextResponse.json({error:error.message},{status:500});
    const parent=Array.isArray(enrolment?.daily_sessions)?enrolment.daily_sessions[0]:enrolment?.daily_sessions;
    parentActive=Boolean(enrolment&&!['declined','cancelled','abandoned'].includes(enrolment.status)&&parent&&!['cancelled','archived'].includes(parent.status));
  }
  if(!parentActive)return NextResponse.json({error:"Ce document est sans objet car son dossier métier n’est plus actif."},{status:409});

  const openedVersion=Number(current.metadata?.review_opened_version);
  const openedSha=typeof current.metadata?.review_opened_sha256==="string"?current.metadata.review_opened_sha256:"";
  const openedBy=typeof current.metadata?.review_opened_by_email==="string"?current.metadata.review_opened_by_email.toLowerCase():"";
  if(openedVersion!==current.version||openedSha!==current.sha256||openedBy!==auth.email.toLowerCase()){
    return NextResponse.json({error:"Ouvre cette version de la pièce dans Studio avant de la valider, de demander une correction ou de la publier."},{status:409});
  }

  if(action==="publish"){
    const publication=await publishDailyDocumentAndNotify({admin,document:current,publishedBy:userId,publishedByEmail:auth.email});
    if(!publication.ok)return NextResponse.json({error:publication.error},{status:publication.status});
    const sessionId=typeof current.metadata?.session_id==="string"?current.metadata.session_id:"";
    if(sessionId)await syncChecklist(admin,sessionId);
    return NextResponse.json({document:publication.document,notification:publication.notification});
  }

  if(["published","signed","archived"].includes(current.status))return NextResponse.json({error:"Ce document n’est plus modifiable dans ce circuit de revue."},{status:400});
  const metadata={...(current.metadata??{}),review_note:note||null,reviewed_at:new Date().toISOString(),reviewed_by_email:auth.email};
  const updates=action==="validate"?{status:"validated",validated_by:userId,validated_at:new Date().toISOString(),updated_by:userId,metadata}:{status:"correction_requested",validated_by:null,validated_at:null,updated_by:userId,metadata};
  const {data,error}=await admin.from("daily_documents").update(updates)
    .eq("id",id)
    .in("organisation_id",organisationIds)
    .eq("is_current",true)
    .eq("updated_at",expectedUpdatedAt)
    .eq("status",expectedStatus)
    .eq("version",expectedVersion)
    .select("*")
    .maybeSingle();
  if(error)return NextResponse.json({error:error.message},{status:400});
  if(!data)return NextResponse.json({error:"La pièce a changé pendant le contrôle. Recharge la file puis recommence sur la version courante."},{status:409});
  const sessionId=typeof metadata.session_id==="string"?metadata.session_id:"";
  if(sessionId)await syncChecklist(admin,sessionId);
  return NextResponse.json({document:data});
}
