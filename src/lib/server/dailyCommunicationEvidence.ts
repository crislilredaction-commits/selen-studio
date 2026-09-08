import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export type CommunicationEvidenceCheck = { ok:boolean; detail:string; communicationCount:number; missingEvidenceCount:number };

export async function getCommunicationEvidenceCheck(organisationId:string, sessionId:string):Promise<CommunicationEvidenceCheck>{
  const admin=createSupabaseAdminClient();
  const {data,error}=await admin.from("daily_communications")
    .select("id,status,sent_at,delivered_at,provider_message_id,recipient_email,communication_type,metadata")
    .eq("organisation_id",organisationId)
    .contains("metadata",{session_id:sessionId})
    .order("created_at",{ascending:false});
  if(error) throw new Error(error.message);
  const rows=data??[];
  const sent=rows.filter(row=>["sent","delivered"].includes(String(row.status))&&Boolean(row.sent_at)&&Boolean(row.recipient_email));
  const missing=sent.filter(row=>!row.provider_message_id).length;
  if(!sent.length)return{ok:false,detail:"Aucune communication horodatée rattachée à cette session.",communicationCount:0,missingEvidenceCount:0};
  return{ok:missing===0,detail:missing===0?`${sent.length} envoi(s) horodaté(s) avec identifiant prestataire. Preuve PDF disponible depuis le registre des communications.`:`${sent.length} envoi(s) horodaté(s), dont ${missing} sans identifiant prestataire à vérifier.`,communicationCount:sent.length,missingEvidenceCount:missing};
}
