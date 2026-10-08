import { NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";

export async function GET(request: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "Document manquant." }, { status: 400 });
  const organisationIds = await getDailyOrganisationIdsForAgent(auth.email);
  if (organisationIds.length === 0) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  const admin = createSupabaseAdminClient();
  const { data: document, error } = await admin.from("daily_documents")
    .select("bucket,storage_path,logical_name,organisation_id")
    .eq("id", id).in("organisation_id", organisationIds)
    .eq("document_type", "learning_assessment_evidence")
    .eq("is_current", true).is("archived_at", null).maybeSingle();
  if (error || !document || document.bucket !== "documents" || !document.storage_path?.startsWith(`daily/${document.organisation_id}/`)) {
    return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  }
  const { data: signed, error: signError } = await admin.storage.from("documents").createSignedUrl(document.storage_path, 120, { download: document.logical_name });
  if (signError || !signed?.signedUrl) return NextResponse.json({ error: "Consultation indisponible." }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl);
}
