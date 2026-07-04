import { NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export async function GET(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Convocation introuvable." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: convocation, error } = await admin
    .from("daily_convocations")
    .select("id,document_name,storage_path")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!convocation?.storage_path) {
    return NextResponse.json({ error: "Fichier convocation introuvable." }, { status: 404 });
  }

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
