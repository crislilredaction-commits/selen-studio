import { NextResponse } from "next/server";
import { requireStudioAgent } from "@/lib/server/studioAuth";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const auth = await requireStudioAgent();
    if (!auth.ok) return auth.response;

    const supabase = createSupabaseAdminClient();
    const {
      content,
      dossierId = null,
      authorName = "Équipe Selen",
    } = await req.json();

    if (!content || !content.trim()) {
      return NextResponse.json({ error: "content manquant" }, { status: 400 });
    }

    const cleanDossierId =
      typeof dossierId === "string" && dossierId.trim()
        ? dossierId.trim()
        : null;

    if (cleanDossierId) {
      const { data: dossier, error: dossierError } = await supabase
        .from("dossiers")
        .select("id")
        .eq("id", cleanDossierId)
        .maybeSingle();

      if (dossierError) {
        return NextResponse.json({ error: dossierError.message }, { status: 500 });
      }

      if (!dossier) {
        return NextResponse.json(
          { error: "Dossier introuvable." },
          { status: 404 },
        );
      }
    }

    const { error } = await supabase.from("internal_messages").insert({
      content: content.trim(),
      dossier_id: cleanDossierId,
      author_name: authorName,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 500 },
    );
  }
}
