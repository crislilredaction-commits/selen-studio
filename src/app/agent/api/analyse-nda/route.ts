import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  extractCity,
  extractDuration,
  extractEmail,
  extractPostalCode,
  extractSiret,
  extractTrainerNameFromCv,
  extractTrainerNameFromProgramme,
  extractTrainingTitle,
  getRegionFromPostalCode,
} from "@/lib/documentText";
import { normalizeNdaDocumentType } from "@/lib/ndaDocumentTypes";
import { getOrExtractDocumentText } from "@/lib/server/documentTextExtraction";

type DocRow = {
  id: string;
  name: string;
  document_type: string;
  storage_path: string | null;
  extracted_text?: string | null;
  dossier_id?: string | null;
  organisation_id?: string | null;
  created_at?: string | null;
};

type PreviousProgramAnalysisRow = {
  source_cv_text: string | null;
  source_program_text: string | null;
  created_at: string;
};

function sortNewestFirst<T extends { created_at?: string | null }>(
  docs: T[],
): T[] {
  return [...docs].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
}

function pickPreferredDoc(
  dossierDocs: DocRow[],
  globalDocs: DocRow[],
  wantedTypes: string[],
): DocRow | undefined {
  const dossierMatch = sortNewestFirst(
    dossierDocs.filter((d) =>
      wantedTypes.includes(normalizeNdaDocumentType(d.document_type)),
    ),
  )[0];
  if (dossierMatch) return dossierMatch;
  return sortNewestFirst(
    globalDocs.filter((d) =>
      wantedTypes.includes(normalizeNdaDocumentType(d.document_type)),
    ),
  )[0];
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const dossierId = formData.get("dossier_id") as string | null;

    if (!dossierId) {
      return NextResponse.json(
        { error: "dossier_id manquant" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_SUPABASE_URL manquante." },
        { status: 500 },
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY manquante." },
        { status: 500 },
      );
    }

    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const { data: dossier, error: dossierError } = await supabase
      .from("dossiers")
      .select("id, organisation_id")
      .eq("id", dossierId)
      .maybeSingle();

    if (dossierError || !dossier) {
      return NextResponse.json(
        { error: "Dossier introuvable." },
        { status: 404 },
      );
    }

    const [
      { data: dossierDocsRaw, error: dossierDocsError },
      { data: globalDocsRaw, error: globalDocsError },
    ] = await Promise.all([
      supabase
        .from("documents")
        .select(
          "id, name, document_type, storage_path, extracted_text, dossier_id, organisation_id, created_at",
        )
        .eq("dossier_id", dossierId),
      supabase
        .from("documents")
        .select(
          "id, name, document_type, storage_path, extracted_text, dossier_id, organisation_id, created_at",
        )
        .eq("organisation_id", dossier.organisation_id)
        .is("dossier_id", null),
    ]);

    if (dossierDocsError) {
      return NextResponse.json(
        { error: dossierDocsError.message },
        { status: 500 },
      );
    }

    if (globalDocsError) {
      return NextResponse.json(
        { error: globalDocsError.message },
        { status: 500 },
      );
    }

    const dossierDocs = (dossierDocsRaw ?? []) as DocRow[];
    const globalDocs = (globalDocsRaw ?? []) as DocRow[];

    console.log("DOSSIER DOCS COUNT:", dossierDocs.length);
    console.log("GLOBAL DOCS COUNT:", globalDocs.length);
    console.log(
      "DOSSIER DOCS:",
      dossierDocs.map((d) => ({
        name: d.name,
        type: d.document_type,
        path: d.storage_path,
        created_at: d.created_at,
      })),
    );

    const cvDoc = pickPreferredDoc(dossierDocs, globalDocs, ["cv_formateur"]);
    const programmeDoc = pickPreferredDoc(dossierDocs, globalDocs, [
      "programme_formation",
    ]);
    const entrepriseDoc = pickPreferredDoc(dossierDocs, globalDocs, [
      "kbis",
      "avis_insee",
    ]);

    if (!cvDoc || !programmeDoc || !entrepriseDoc) {
      return NextResponse.json(
        {
          error:
            "Documents insuffisants. Il faut au minimum un CV, un programme et un KBIS ou avis INSEE.",
        },
        { status: 400 },
      );
    }

    const { data: previousAnalyses, error: previousAnalysesError } =
      await supabase
        .from("program_ai_analyses")
        .select("source_cv_text, source_program_text, created_at")
        .eq("dossier_id", dossierId)
        .order("created_at", { ascending: false })
        .limit(5);

    if (previousAnalysesError) {
      return NextResponse.json(
        { error: previousAnalysesError.message },
        { status: 500 },
      );
    }

    const previousAnalysis = (
      (previousAnalyses ?? []) as PreviousProgramAnalysisRow[]
    ).find(
      (analysis) =>
        (analysis.source_cv_text?.trim().length ?? 0) > 20 ||
        (analysis.source_program_text?.trim().length ?? 0) > 20,
    );

    const [cvTextResult, programmeTextResult, entrepriseTextResult] =
      await Promise.all([
        getOrExtractDocumentText(serviceSupabase, cvDoc),
        getOrExtractDocumentText(serviceSupabase, programmeDoc),
        getOrExtractDocumentText(serviceSupabase, entrepriseDoc),
      ]);

    let cvText = cvTextResult.text;
    let programmeText = programmeTextResult.text;
    const entrepriseText = entrepriseTextResult.text;

    if (!cvText.trim() && previousAnalysis?.source_cv_text?.trim()) {
      cvText = previousAnalysis.source_cv_text.trim();
      await serviceSupabase
        .from("documents")
        .update({ extracted_text: cvText })
        .eq("id", cvDoc.id);
    }

    if (!programmeText.trim() && previousAnalysis?.source_program_text?.trim()) {
      programmeText = previousAnalysis.source_program_text.trim();
      await serviceSupabase
        .from("documents")
        .update({ extracted_text: programmeText })
        .eq("id", programmeDoc.id);
    }

    if (!cvText.trim()) {
      return NextResponse.json(
        {
          error:
            "Le CV sélectionné existe, mais aucun texte n’a pu être extrait. Merci de réimporter un fichier Word/PDF lisible ou de corriger le format du document.",
          debug: {
            selectedCvDocName: cvDoc.name,
            selectedCvExtractionError: cvTextResult.error,
            cvTextLength: cvText.length,
          },
        },
        { status: 422 },
      );
    }

    if (!programmeText.trim()) {
      return NextResponse.json(
        {
          error:
            "Le programme sélectionné existe, mais aucun texte n’a pu être extrait. Merci de réimporter un fichier Word/PDF lisible ou de corriger le format du document.",
          debug: {
            selectedProgrammeDocName: programmeDoc.name,
            selectedProgrammeExtractionError: programmeTextResult.error,
            programmeTextLength: programmeText.length,
          },
        },
        { status: 422 },
      );
    }

    if (!entrepriseText.trim()) {
      return NextResponse.json(
        {
          error:
            "Le document entreprise sélectionné existe, mais aucun texte n’a pu être extrait. Merci de réimporter un KBIS ou avis INSEE lisible.",
          debug: {
            selectedEntrepriseDocName: entrepriseDoc.name,
            selectedEntrepriseExtractionError: entrepriseTextResult.error,
            entrepriseTextLength: entrepriseText.length,
          },
        },
        { status: 422 },
      );
    }

    console.log("CV TEXT LENGTH:", cvText.length);
    console.log("PROGRAMME TEXT LENGTH:", programmeText.length);
    console.log("ENTREPRISE TEXT LENGTH:", entrepriseText.length);
    console.log("CV EXTRACTION SOURCE:", cvTextResult.source);
    console.log("PROGRAMME EXTRACTION SOURCE:", programmeTextResult.source);
    console.log("ENTREPRISE EXTRACTION SOURCE:", entrepriseTextResult.source);
    console.log("CV TEXT PREVIEW:", cvText.slice(0, 300));
    console.log("PROGRAMME TEXT PREVIEW:", programmeText.slice(0, 300));
    console.log("ENTREPRISE TEXT PREVIEW:", entrepriseText.slice(0, 300));

    // -------------------------------------------------------------------------
    // Extraction nom formateur : CV en priorité, programme en fallback
    // -------------------------------------------------------------------------

    let trainerName = extractTrainerNameFromCv(cvText);
    let sourceFormateur: "cv" | "programme" | "none" = "none";

    if (trainerName.formateur_prenom && trainerName.formateur_nom) {
      sourceFormateur = "cv";
    } else {
      // Le CV n'a pas fourni de nom — on tente le programme
      const fromProgramme = extractTrainerNameFromProgramme(programmeText);
      if (fromProgramme.formateur_prenom && fromProgramme.formateur_nom) {
        trainerName = fromProgramme;
        sourceFormateur = "programme";
      }
    }

    console.log("source_formateur:", sourceFormateur);
    console.log("trainerName:", trainerName);

    // -------------------------------------------------------------------------
    // Email : depuis le CV uniquement
    // -------------------------------------------------------------------------
    const trainerEmail = extractEmail(cvText);

    // -------------------------------------------------------------------------
    // Infos entreprise : depuis le doc KBIS / avis INSEE
    // -------------------------------------------------------------------------
    const siret = extractSiret(entrepriseText);
    const codePostal = extractPostalCode(entrepriseText);
    const ville = extractCity(entrepriseText, codePostal);
    const region = getRegionFromPostalCode(codePostal);

    // -------------------------------------------------------------------------
    // Infos formation : depuis le programme
    // -------------------------------------------------------------------------
    const intituleFormation =
      extractTrainingTitle(programmeText) ||
      programmeDoc.name.replace(/\.[^/.]+$/, "").trim();

    const dureeFormation = extractDuration(programmeText);

    console.log("trainerEmail:", trainerEmail);
    console.log("siret:", siret);
    console.log("codePostal:", codePostal);
    console.log("ville:", ville);
    console.log("region:", region);
    console.log("intituleFormation:", intituleFormation);
    console.log("dureeFormation:", dureeFormation);

    const payload = {
      formateur_nom: trainerName.formateur_nom || null,
      formateur_prenom: trainerName.formateur_prenom || null,
      formateur_email: trainerEmail || null,
      intitule_formation: intituleFormation || null,
      duree_formation: dureeFormation || null,
      modalite: "presentiel",
      nb_formateurs: 1,
      siret: siret || null,
      code_postal: codePostal || null,
      ville: ville || null,
      region: region || null,
    };

    console.log("Analyse NDA payload:", payload);

    const { error: ndaError } = await supabase.from("nda_variables").upsert(
      {
        dossier_id: dossierId,
        organisation_id: dossier.organisation_id,
        ...payload,
      },
      { onConflict: "dossier_id" },
    );

    if (ndaError) {
      return NextResponse.json({ error: ndaError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, payload });
  } catch (error) {
    console.error("Analyse NDA fatal error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 500 },
    );
  }
}
