import { NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { DailySourceError, loadScopedDailyFormation, loadPrivateDailySource, downloadPrivateDailySource } from "@/lib/server/dailyStudioFormationSources";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const kind = new URL(req.url).searchParams.get("kind");
  if (kind !== "program" && kind !== "positioning" && kind !== "assessment") return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  try {
    const admin = createSupabaseAdminClient();
    const formation = await loadScopedDailyFormation(admin, auth.email, (await params).id);
    if (!formation) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
    return await downloadPrivateDailySource(admin, await loadPrivateDailySource(admin, formation, kind));
  } catch (error) {
    return NextResponse.json({ error: error instanceof DailySourceError ? error.message : "Téléchargement indisponible." }, { status: error instanceof DailySourceError ? error.status : 500 });
  }
}
