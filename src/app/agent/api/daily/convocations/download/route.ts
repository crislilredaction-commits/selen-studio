import { NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";

export async function GET(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Convocation introuvable." }, { status: 400 });

  const organisationIds = await getDailyOrganisationIdsForAgent(auth.email);
  if (organisationIds.length === 0) {
    return NextResponse.json({ error: "Convocation introuvable." }, { status: 404 });
  }

  const admin = createSupabaseAdminClient();
  const { data: convocation, error } = await admin
    .from("daily_convocations")
    .select("id,session_id,document_name,storage_path")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!convocation?.storage_path || !convocation.session_id) {
    return NextResponse.json({ error: "Fichier convocation introuvable." }, { status: 404 });
  }

  const { data: session, error: sessionError } = await admin
    .from("daily_sessions")
    .select("id")
    .eq("id", convocation.session_id)
    .in("organisation_id", organisationIds)
    .maybeSingle();
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Convocation introuvable." }, { status: 404 });

  const { data, error: signedUrlError } = await admin.storage
    .from("documents")
    .createSignedUrl(convocation.storage_path, 60 * 10, {
      download: convocation.document_name ?? true,
    });

  if (signedUrlError || !data?.signedUrl) {
    return NextResponse.json(
      { error: signedUrlError?.message ?? "Impossible de generer le lien." },
      { status: 500 },
    );
  }

  return NextResponse.redirect(data.signedUrl);
}
