import { NextResponse } from "next/server";
import { requireStudioAgent } from "@/lib/server/studioAuth";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const auth = await requireStudioAgent();
    if (!auth.ok) return auth.response;

    const supabase = createSupabaseAdminClient();

    const { documentId } = await req.json();

    if (!documentId) {
      return NextResponse.json(
        { error: "documentId manquant." },
        { status: 400 },
      );
    }

    const { data: doc, error: fetchError } = await supabase
      .from("documents")
      .select("id, storage_path, dossier_id, organisation_id")
      .eq("id", documentId)
      .maybeSingle();

    if (fetchError || !doc) {
      return NextResponse.json(
        { error: "Document introuvable." },
        { status: 404 },
      );
    }

    if (!doc.dossier_id && !doc.organisation_id) {
      return NextResponse.json(
        { error: "Document sans rattachement dossier ou organisation." },
        { status: 422 },
      );
    }

    if (doc.dossier_id) {
      const { data: dossier, error: dossierError } = await supabase
        .from("dossiers")
        .select("id, organisation_id")
        .eq("id", doc.dossier_id)
        .maybeSingle();

      if (dossierError) {
        return NextResponse.json({ error: dossierError.message }, { status: 500 });
      }

      if (!dossier) {
        return NextResponse.json(
          { error: "Dossier rattache introuvable." },
          { status: 409 },
        );
      }

      if (doc.organisation_id && dossier.organisation_id !== doc.organisation_id) {
        return NextResponse.json(
          { error: "Document incoherent avec son dossier." },
          { status: 409 },
        );
      }
    } else if (doc.organisation_id) {
      const { data: organisation, error: organisationError } = await supabase
        .from("organisations")
        .select("id")
        .eq("id", doc.organisation_id)
        .maybeSingle();

      if (organisationError) {
        return NextResponse.json(
          { error: organisationError.message },
          { status: 500 },
        );
      }

      if (!organisation) {
        return NextResponse.json(
          { error: "Organisation rattachee introuvable." },
          { status: 409 },
        );
      }
    }

    if (doc.storage_path) {
      const { error: storageError } = await supabase.storage
        .from("documents")
        .remove([doc.storage_path]);

      if (storageError) {
        return NextResponse.json(
          { error: `Storage: ${storageError.message}` },
          { status: 500 },
        );
      }
    }

    const { error: deleteError } = await supabase
      .from("documents")
      .delete()
      .eq("id", documentId);

    if (deleteError) {
      return NextResponse.json(
        { error: `Database: ${deleteError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
