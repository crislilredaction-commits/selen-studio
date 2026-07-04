import { NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export async function GET(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Convention introuvable." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: convention, error } = await admin
    .from("daily_conventions")
    .select("id,document_name,storage_path")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!convention?.storage_path) {
    return NextResponse.json({ error: "Fichier convention introuvable." }, { status: 404 });
  }

  const { data: signedUrlData, error: signedUrlError } = await admin.storage
    .from("documents")
    .createSignedUrl(convention.storage_path, 60 * 10, {
      download: convention.document_name ?? true,
    });

  if (signedUrlError || !signedUrlData?.signedUrl) {
    return NextResponse.json(
      { error: signedUrlError?.message ?? "Impossible de generer le lien de telechargement." },
      { status: 500 },
    );
  }

  return NextResponse.redirect(signedUrlData.signedUrl);
}
