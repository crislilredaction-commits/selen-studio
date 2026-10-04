import { NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { DailySourceError } from "@/lib/server/dailyStudioFormationSources";
import { downloadScopedDailyOrganisationDocument } from "@/lib/server/dailyStudioOrganisationDocuments";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    return await downloadScopedDailyOrganisationDocument(createSupabaseAdminClient(), auth.email, (await params).id);
  } catch (error) {
    return NextResponse.json({ error: error instanceof DailySourceError ? error.message : "Téléchargement indisponible." }, { status: error instanceof DailySourceError ? error.status : 500 });
  }
}
