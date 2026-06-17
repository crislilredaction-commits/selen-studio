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

type NdaManualAnalysisTextsRow = {
  cv_manual_text: string | null;
  program_manual_text: string | null;
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

function buildNdaListeFormateursResumeFromCv(
  cvText: string,
  programmeText: string,
) {
  const cleanedCvText = cvText
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();

  const formationTitle =
    extractTrainingTitle(programmeText)?.trim() || "la formation concernée";

  if (!cleanedCvText) return "";

  const lines = cleanedCvText
    .split("\n")
    .map((line) =>
      line
        .replace(/^[\s•·\-–—*]+/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((line) => line.length >= 8 && line.length <= 260);

  const uniqueLines = Array.from(new Set(lines));

  const hasYear = (value: string) => /\b(19|20)\d{2}\b/.test(value);
  const hasDuration = (value: string) =>
    /\b\d+\s*(an|ans|année|années|mois)\b/i.test(value) ||
    /\b(19|20)\d{2}\s*[-–—]\s*(19|20)\d{2}\b/.test(value);

  const pickLines = (patterns: RegExp[], limit = 8) =>
    uniqueLines
      .filter((line) => patterns.some((pattern) => pattern.test(line)))
      .slice(0, limit);

  const diplomaLines = pickLines([
    /dipl[oô]me/i,
    /certificat/i,
    /certification/i,
    /titre professionnel/i,
    /attestation/i,
    /habilitation/i,
    /formation suivie/i,
    /bac\b/i,
    /bts\b/i,
    /licence\b/i,
    /master\b/i,
    /doctorat\b/i,
  ]);

  const experienceLines = pickLines(
    [
      /exp[ée]rience/i,
      /poste/i,
      /fonction/i,
      /emploi/i,
      /salari[ée]/i,
      /ind[ée]pendant/i,
      /dirigeant/i,
      /responsable/i,
      /charg[ée]/i,
      /consultant/i,
      /formateur/i,
      /formatrice/i,
      /technicien/i,
      /manager/i,
      /coordinateur/i,
      /chef/i,
      /g[ée]rant/i,
      /entreprise/i,
      /soci[ée]t[ée]/i,
    ],
    10,
  );

  const competenceLines = pickLines(
    [
      /comp[ée]tence/i,
      /mission/i,
      /activit[ée]/i,
      /accompagnement/i,
      /animation/i,
      /gestion/i,
      /conseil/i,
      /encadrement/i,
      /coordination/i,
      /analyse/i,
      /suivi/i,
      /pilotage/i,
      /maîtrise/i,
      /pratique/i,
      /terrain/i,
    ],
    10,
  );

  const fallbackCompetences = [
    `compétences techniques et pratiques liées à ${formationTitle}`,
    "capacité à expliquer les gestes, méthodes ou raisonnements professionnels attendus",
    "capacité à relier les situations de terrain aux objectifs pédagogiques de la formation",
    "capacité à accompagner des apprenants dans l’acquisition de compétences opérationnelles",
    "capacité à évaluer la progression et à adapter les explications au niveau du public",
  ];

  const sections: string[] = [];

  sections.push("Diplômes / attestations identifiés :");
  if (diplomaLines.length) {
    sections.push(
      ...diplomaLines.map(
        (line) =>
          `- ${line}${hasYear(line) ? "" : " (année d’obtention à vérifier / compléter)"}`,
      ),
    );
  } else {
    sections.push(
      "- Aucun diplôme, titre, certificat ou attestation clairement identifiable dans le texte extrait du CV. À compléter par l’agent si l’information figure dans le document original ou dans une pièce jointe séparée.",
    );
  }

  sections.push("");
  sections.push("Expériences professionnelles pertinentes :");
  if (experienceLines.length) {
    sections.push(
      ...experienceLines.map(
        (line) =>
          `- ${line}${hasDuration(line) ? "" : " (durée, dates ou entreprise à vérifier / compléter)"}`,
      ),
    );
  } else {
    sections.push(
      `- Le CV mentionne une expérience en lien avec ${formationTitle}, mais les postes, durées et entreprises ne sont pas suffisamment détaillés dans le texte extrait. À compléter par l’agent à partir du CV original.`,
    );
  }

  sections.push("");
  sections.push("Compétences mobilisables pour animer la formation :");
  if (competenceLines.length) {
    sections.push(
      ...competenceLines.map(
        (line) =>
          `- ${line} — compétence à relier aux objectifs de la formation "${formationTitle}".`,
      ),
    );
  } else {
    sections.push(
      "- Le CV ne détaille pas suffisamment les missions confiées. Compétences types à vérifier par l’agent :",
      ...fallbackCompetences.map((line) => `  - ${line}.`),
    );
  }

  sections.push("");
  sections.push("Lien avec la formation visée :");
  sections.push(
    `- Le parcours du formateur doit être rapproché de la formation "${formationTitle}". L’agent doit vérifier que les diplômes, attestations, expériences professionnelles et missions réellement présentes dans le CV justifient la capacité du formateur à enseigner ce domaine.`,
  );

  sections.push("");
  sections.push("Points à compléter par l’agent :");
  sections.push(
    "- Préciser les années d’obtention des diplômes / attestations si elles sont visibles dans le CV.",
    "- Préciser le nombre d’années d’expérience réellement justifiable.",
    "- Mentionner les entreprises ou structures concernées lorsque l’information est présente.",
    "- Supprimer toute compétence type non vérifiable si elle ne correspond pas au parcours réel du formateur.",
  );

  return sections.join("\n");
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

    const { data: ndaVariablesManualTexts, error: ndaVariablesManualError } =
      await supabase
        .from("nda_variables")
        .select("cv_manual_text, program_manual_text")
        .eq("dossier_id", dossierId)
        .maybeSingle();

    if (ndaVariablesManualError) {
      return NextResponse.json(
        { error: ndaVariablesManualError.message },
        { status: 500 },
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
    const manualTexts =
      (ndaVariablesManualTexts as NdaManualAnalysisTextsRow | null) ?? null;
    const manualCvText = manualTexts?.cv_manual_text?.trim() ?? "";
    const manualProgrammeText =
      manualTexts?.program_manual_text?.trim() ?? "";
    let cvTextSource: string = cvTextResult.source;
    let programmeTextSource: string = programmeTextResult.source;

    if (manualCvText.length >= 20) {
      cvText = manualCvText;
      cvTextSource = "manual_agent";
    }

    if (manualProgrammeText.length >= 20) {
      programmeText = manualProgrammeText;
      programmeTextSource = "manual_agent";
    }

    if (!cvText.trim() && previousAnalysis?.source_cv_text?.trim()) {
      cvText = previousAnalysis.source_cv_text.trim();
      cvTextSource = "previous_analysis";
      await serviceSupabase
        .from("documents")
        .update({ extracted_text: cvText })
        .eq("id", cvDoc.id);
    }

    if (
      !programmeText.trim() &&
      previousAnalysis?.source_program_text?.trim()
    ) {
      programmeText = previousAnalysis.source_program_text.trim();
      programmeTextSource = "previous_analysis";
      await serviceSupabase
        .from("documents")
        .update({ extracted_text: programmeText })
        .eq("id", programmeDoc.id);
    }

    const missingUsableTextMessage =
      "L’analyse automatique a besoin d’un texte exploitable pour le CV et le programme. Collez un résumé ou le contenu du document dans les zones prévues.";

    if (!cvText.trim()) {
      return NextResponse.json(
        {
          error: missingUsableTextMessage,
          detail:
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
          error: missingUsableTextMessage,
          detail:
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
    console.log("CV EXTRACTION SOURCE:", cvTextSource);
    console.log("PROGRAMME EXTRACTION SOURCE:", programmeTextSource);
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

    const listeFormateursDirigeantResume = buildNdaListeFormateursResumeFromCv(
      cvText,
      programmeText,
    );

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
      liste_formateurs_dirigeant_resume: listeFormateursDirigeantResume || null,
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
