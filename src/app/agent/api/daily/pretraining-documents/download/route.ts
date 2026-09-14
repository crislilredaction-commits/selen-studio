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
  const { data:document,error } = await admin
    .from("daily_documents")
    .select("bucket,storage_path,document_type,organisation_id")
    .eq("id",id)
    .in("organisation_id",organisationIds)
    .in("document_type",["training_program","training_agreement","convocation","registration_positioning"])
    .single();
  if (error || !document) return NextResponse.json({error:"Document introuvable."},{status:404});
  const { data:signed,error:signError } = await admin.storage.from(document.bucket).createSignedUrl(document.storage_path,120);
  if (signError || !signed?.signedUrl) return NextResponse.json({error:"Téléchargement indisponible."},{status:500});
  return NextResponse.redirect(signed.signedUrl);
}
