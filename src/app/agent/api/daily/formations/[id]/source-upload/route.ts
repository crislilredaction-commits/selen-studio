import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { DAILY_SOURCE_MIME_TYPES, loadScopedDailyFormation, DailySourceError } from "@/lib/server/dailyStudioFormationSources";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => null);
  if (!body || !["positioning", "assessment"].includes(body.kind) || !DAILY_SOURCE_MIME_TYPES.has(body.mime_type)
    || !Number.isInteger(body.size_bytes) || body.size_bytes <= 0 || body.size_bytes > 10 * 1024 * 1024) return NextResponse.json({ error: "Choisis un document PDF ou Word de moins de 10 Mo." }, { status: 400 });
  try {
    const admin = createSupabaseAdminClient();
    const formation = await loadScopedDailyFormation(admin, auth.email, (await params).id);
    if (!formation || !["draft", "review", "correction_requested", "validated"].includes(formation.status)) return NextResponse.json({ error: "Programme introuvable." }, { status: 404 });
    if (formation.updated_at !== body.expected_updated_at) return NextResponse.json({ error: "Le programme a changé. Actualise le dossier avant d’importer le document." }, { status: 409 });
    if ((body.kind === "positioning" && formation.positioning_mode !== "off_platform") || (body.kind === "assessment" && formation.learning_assessment_mode !== "external")) return NextResponse.json({ error: "Ce questionnaire utilise le mode Selen." }, { status: 409 });
    const id = randomUUID();
    const path = "daily/" + formation.organisation_id + "/formation-sources/" + formation.id + "/" + body.kind + "/" + id;
    const { data, error } = await admin.storage.from("documents").createSignedUploadUrl(path, { upsert: false });
    if (error || !data?.token) return NextResponse.json({ error: "Import indisponible." }, { status: 500 });
    return NextResponse.json({ id, path, token: data.token }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof DailySourceError ? error.message : "Import indisponible." }, { status: error instanceof DailySourceError ? error.status : 500 });
  }
}
