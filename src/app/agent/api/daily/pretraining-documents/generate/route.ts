import { NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";
import { createAgentAssistanceToken } from "@/lib/server/agentAssistanceTokens";
import { getVitrineBaseUrl } from "@/lib/vitrineLinks";

export async function POST(req:Request){
  const auth=await requireSupportAgent();
  if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
  const body=await req.json().catch(()=>({}));
  if(body.confirm_prepare!==true || typeof body.session_id!=="string")return NextResponse.json({error:"Session et confirmation de préparation requises."},{status:400});
  const admin=createSupabaseAdminClient();
  const organisations=await getDailyOrganisationIdsForAgent(auth.email);
  const {data:session,error}=await admin.from("daily_sessions").select("id,organisation_id,status").eq("id",body.session_id).in("organisation_id",organisations).maybeSingle();
  if(error||!session || ["archived","cancelled"].includes(session.status))return NextResponse.json({error:"Session inaccessible."},{status:404});
  let delegation:{tokenId:string;url:string}|undefined;
  try{
    delegation=await createAgentAssistanceToken({agentUserId:auth.userId,agentEmail:auth.email,organisationId:session.organisation_id,headersList:req.headers});
    const target=new URL("/api/client/daily/pretraining-documents",getVitrineBaseUrl());
    const delegatedUrl=new URL(delegation.url);
    if(delegatedUrl.origin!==target.origin || !delegatedUrl.searchParams.get("assistanceToken"))throw new Error("Délégation indisponible.");
    const response=await fetch(target,{method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(25000),headers:{"Content-Type":"application/json","x-selen-agent-assistance":delegatedUrl.searchParams.get("assistanceToken")!},body:JSON.stringify({session_id:session.id,only_missing:true,confirm_delegated:true})});
    const result=await response.json().catch(()=>null);
    if(!result)return NextResponse.json({error:"Réponse documentaire Daily indisponible."},{status:502});
    return NextResponse.json(result,{status:response.status});
  }catch{return NextResponse.json({error:"La préparation Daily n’a pas pu être confirmée. Rechargez la liste avant de réessayer."},{status:502});}
  finally{if(delegation){
    const {error}=await admin.from("selen_agent_assistance_tokens").update({status:"revoked"}).eq("id",delegation.tokenId).eq("agent_user_id",auth.userId);
    if(error)return NextResponse.json({error:"La préparation n’a pas pu être clôturée. Rechargez les pièces et contactez Selen avant une nouvelle tentative."},{status:502});
  }}
}
