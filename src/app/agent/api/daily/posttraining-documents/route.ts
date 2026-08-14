import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

const types=["attendance_summary","completion_certificate"];

async function syncChecklist(admin:ReturnType<typeof createSupabaseAdminClient>,sessionId:string){
  const {data:docs}=await admin.from("daily_documents").select("status").in("document_type",types).eq("is_current",true).contains("metadata",{session_id:sessionId});
  const rows=docs??[]; if(rows.length===0)return; const status=rows.every((doc)=>doc.status==="validated")?"validated":"to_review";
  await admin.from("daily_session_checklist_items").update({status}).eq("session_id",sessionId).eq("item_key","posttraining_documents").neq("status","not_applicable");
}

export async function GET(){
 const auth=await requireSupportAgent();if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});const admin=createSupabaseAdminClient();const {data,error}=await admin.from("daily_documents").select("*,organisations(name)").in("document_type",types).eq("is_current",true).order("created_at",{ascending:false});if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({documents:data??[]});
}

export async function PATCH(req:Request){
 const auth=await requireSupportAgent();if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});const body=await req.json().catch(()=>({}));const id=String(body.id??"");const action=String(body.action??"");const note=typeof body.note==="string"?body.note.trim():"";if(!id||!["validate","request_correction"].includes(action))return NextResponse.json({error:"Action invalide."},{status:400});
 const supabase=await createClient();const {data:userData}=await supabase.auth.getUser();const userId=userData.user?.id;if(!userId)return NextResponse.json({error:"Utilisateur introuvable."},{status:401});const admin=createSupabaseAdminClient();const {data:current,error:readError}=await admin.from("daily_documents").select("id,status,metadata").eq("id",id).in("document_type",types).eq("is_current",true).single();if(readError||!current)return NextResponse.json({error:"Document introuvable."},{status:404});
 const metadata={...(current.metadata??{}),review_note:note||null,reviewed_at:new Date().toISOString(),reviewed_by_email:auth.email};const updates=action==="validate"?{status:"validated",validated_by:userId,validated_at:new Date().toISOString(),updated_by:userId,metadata}:{status:"correction_requested",validated_by:null,validated_at:null,updated_by:userId,metadata};const {data,error}=await admin.from("daily_documents").update(updates).eq("id",id).select("*").single();if(error)return NextResponse.json({error:error.message},{status:400});const sessionId=typeof metadata.session_id==="string"?metadata.session_id:"";if(sessionId)await syncChecklist(admin,sessionId);return NextResponse.json({document:data});
}
