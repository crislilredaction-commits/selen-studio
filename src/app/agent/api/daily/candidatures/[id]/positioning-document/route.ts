import { NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { DailySourceError, downloadPrivateDailySource } from "@/lib/server/dailyStudioFormationSources";
import { loadScopedDailyCandidature, loadCandidaturePositioning } from "@/lib/server/dailyStudioCandidature";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const admin = createSupabaseAdminClient();
    const dossier = await loadScopedDailyCandidature(admin, auth.email, (await params).id);
    if (!dossier) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
    const positioning = await loadCandidaturePositioning(admin, dossier.request, dossier.formation);
    const requested = new URL(req.url).searchParams.get("document");
    const document = requested === "original" ? positioning?.original : positioning?.filled.find(item => item.id === requested);
    if (!document) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
    return await downloadPrivateDailySource(admin, document);
  } catch (error) {
    return NextResponse.json({ error: error instanceof DailySourceError ? error.message : "Téléchargement indisponible." }, { status: error instanceof DailySourceError ? error.status : 500 });
  }
}
