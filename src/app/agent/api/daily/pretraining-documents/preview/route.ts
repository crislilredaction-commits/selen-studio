import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import mammoth from "mammoth";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";

export async function GET(req:Request){
  const auth=await requireSupportAgent();if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
  const organisations=await getDailyOrganisationIdsForAgent(auth.email),admin=createSupabaseAdminClient();
  const id=new URL(req.url).searchParams.get("id");
  const {data:doc,error}=await admin.from("daily_documents").select("id,organisation_id,bucket,storage_path,mime_type,sha256").eq("id",id).in("organisation_id",organisations).eq("is_current",true).in("document_type",["training_program","training_contract","training_agreement","convocation","welcome_booklet","internal_regulations","registration_positioning"]).maybeSingle();
  if(error||!doc||doc.bucket!=="documents"||!doc.storage_path?.startsWith(`daily/${doc.organisation_id}/`))return NextResponse.json({error:"Document inaccessible."},{status:404});
  const {data:file,error:downloadError}=await admin.storage.from("documents").download(doc.storage_path);
  if(downloadError||!file)return NextResponse.json({error:"Pièce indisponible."},{status:502});
  const bytes=Buffer.from(await file.arrayBuffer());
  if(!doc.sha256||createHash("sha256").update(bytes).digest("hex")!==doc.sha256)return NextResponse.json({error:"L’intégrité de la pièce ne peut pas être confirmée."},{status:409});
  const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'; frame-ancestors 'self'"};
  if(doc.mime_type==="application/pdf")return new NextResponse(bytes,{headers:{...headers,"Content-Type":"application/pdf","Content-Disposition":"inline"}});
  let html:string;
  if(doc.mime_type==="application/vnd.openxmlformats-officedocument.wordprocessingml.document"){
    try{html=(await mammoth.convertToHtml({buffer:bytes})).value;}catch{return NextResponse.json({error:"Prévisualisation Word indisponible. Téléchargez et relisez la pièce."},{status:422});}
  }else{
    html=bytes.toString("utf8");if(!/<(?:!doctype|html|body)\b/i.test(html))return NextResponse.json({error:"Ce fichier Word nécessite une relecture après téléchargement."},{status:422});
  }
  return new NextResponse(html,{headers:{...headers,"Content-Type":"text/html; charset=utf-8"}});
}
