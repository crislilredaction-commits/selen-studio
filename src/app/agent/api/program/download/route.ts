import { NextResponse } from "next/server";
import {
  buildNdaProgramDocumentHtml,
  hasNdaProgramDocumentContent,
} from "@/lib/server/ndaProgramDocumentHtml";
import { requireStudioAgent } from "@/lib/server/studioAuth";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export async function GET(req: Request) {
  try {
    const auth = await requireStudioAgent();
    if (!auth.ok) return auth.response;

    const supabase = createSupabaseAdminClient();
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

    let selectedVersion = version;

    if (!hasNdaProgramDocumentContent(selectedVersion)) {
      const { data: candidateVersions, error: candidatesError } = await supabase
        .from("dossier_program_versions")
        .select("*")
        .eq("dossier_id", dossierId)
        .order("created_at", { ascending: false })
        .limit(30);

      if (candidatesError) {
        return NextResponse.json(
          { error: candidatesError.message },
          { status: 500 },
        );
      }

      const versionsWithContent = (candidateVersions ?? []).filter(
        hasNdaProgramDocumentContent,
      );

      selectedVersion =
        versionsWithContent.find(
          (candidate) =>
            candidate.version_type === "client_sent" &&
            candidate.client_decision === "validated",
        ) ??
        versionsWithContent.find(
          (candidate) => candidate.version_type === "agent_draft",
        ) ??
        versionsWithContent[0] ??
        null;

      if (!selectedVersion) {
        return NextResponse.json(
          { ok: false, error: "missing_program_content" },
          { status: 422 },
        );
      }
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
            "formateur_nom, formateur_prenom, duree_formation, tarif_formation, modalite, lieu_formation, date_formation_prevue, date_fin_formation, stagiaire_prenom, stagiaire_nom, intitule_formation, siret",
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

    if (!dossier) {
      return NextResponse.json(
        { error: "Dossier introuvable." },
        { status: 404 },
      );
    }

    const organisation = Array.isArray(dossier?.organisations)
      ? dossier.organisations[0]
      : dossier?.organisations;

    const html = buildNdaProgramDocumentHtml({
      kind: "proposal",
      version: selectedVersion,
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
