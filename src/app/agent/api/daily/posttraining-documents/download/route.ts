import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

export async function GET(req:Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({error:auth.error},{status:auth.status});
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({error:"Document manquant."},{status:400});

  const organisationIds = await getDailyOrganisationIdsForAgent(auth.email);
  if (organisationIds.length === 0) return NextResponse.json({error:"Document introuvable."},{status:404});

  const admin = createSupabaseAdminClient();
  const {data:document,error} = await admin
    .from("daily_documents")
    .select("id,bucket,storage_path,document_type,organisation_id,version,status,sha256,metadata,updated_at")
    .eq("id",id)
    .in("organisation_id",organisationIds)
    .in("document_type",["attendance_summary","completion_certificate"])
    .eq("is_current",true)
    .is("archived_at",null)
    .single();
  if (error || !document) return NextResponse.json({error:"Document introuvable."},{status:404});

  const {data:signed,error:signError} = await admin.storage
    .from(document.bucket)
    .createSignedUrl(document.storage_path,120);
  if (signError || !signed?.signedUrl) return NextResponse.json({error:"Consultation indisponible."},{status:500});
  const metadata={
    ...(document.metadata??{}),
    review_opened_at:new Date().toISOString(),
    review_opened_by_email:auth.email,
    review_opened_version:document.version,
    review_opened_sha256:document.sha256,
  };
  const {data:opened,error:openError}=await admin
    .from("daily_documents")
    .update({metadata})
    .eq("id",document.id)
    .eq("is_current",true)
    .eq("updated_at",document.updated_at)
    .select("*")
    .maybeSingle();
  if(openError)return NextResponse.json({error:openError.message},{status:400});
  if(!opened)return NextResponse.json({error:"La pièce a changé pendant son ouverture. Recharge la file et recommence."},{status:409});
  if(req.headers.get("accept")?.includes("application/json"))return NextResponse.json({signedUrl:signed.signedUrl,document:opened});
  return NextResponse.redirect(signed.signedUrl);
}
