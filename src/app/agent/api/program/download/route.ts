import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildNdaProgramDocumentHtml } from "@/lib/server/ndaProgramDocumentHtml";

function getAdminSupabase() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL manquante.");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante.");
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

export async function GET(req: Request) {
  try {
    const supabase = getAdminSupabase();
    const { searchParams } = new URL(req.url);

    const programVersionId = searchParams.get("programVersionId");
    const dossierId = searchParams.get("dossierId");

    if (!programVersionId || !dossierId) {
      return NextResponse.json(
        { error: "programVersionId ou dossierId manquant." },
        { status: 400 },
      );
    }

    const { data: version, error: versionError } = await supabase
      .from("dossier_program_versions")
      .select("*")
      .eq("id", programVersionId)
      .eq("dossier_id", dossierId)
      .maybeSingle();

    if (versionError || !version) {
      return NextResponse.json(
        { error: "Programme introuvable." },
        { status: 404 },
      );
    }

    const [{ data: dossier, error: dossierError }, { data: variables }] =
      await Promise.all([
        supabase
          .from("dossiers")
          .select(
            `
            id,
            organisations:organisation_id (
              name,
              address,
              email,
              phone,
              siret,
              nda_number
            )
          `,
          )
          .eq("id", dossierId)
          .maybeSingle(),
        supabase
          .from("nda_variables")
          .select(
            "formateur_nom, formateur_prenom, duree_formation, modalite, lieu_formation, date_formation_prevue, stagiaire_prenom, stagiaire_nom, intitule_formation",
          )
          .eq("dossier_id", dossierId)
          .maybeSingle(),
      ]);

    if (dossierError) {
      return NextResponse.json(
        { error: "Impossible de charger l'organisme du dossier." },
        { status: 500 },
      );
    }

    const organisation = Array.isArray(dossier?.organisations)
      ? dossier.organisations[0]
      : dossier?.organisations;

    const html = buildNdaProgramDocumentHtml({
      kind: "proposal",
      version,
      organisation: organisation ?? null,
      variables: variables ?? null,
    });

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "application/msword; charset=utf-8",
        "Content-Disposition": `attachment; filename="programme-${programVersionId}.doc"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
