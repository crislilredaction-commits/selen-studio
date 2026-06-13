import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { normalizeNdaDocumentType } from "@/lib/ndaDocumentTypes";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type NdaVariablesRow = {
  dossier_id: string;
  formateur_nom?: string | null;
  formateur_prenom?: string | null;
  formateur_email?: string | null;
  intitule_formation?: string | null;
  duree_formation?: string | null;
  modalite?: string | null;
  nb_formateurs?: number | null;
  ville?: string | null;
  code_postal?: string | null;
  region?: string | null;
  siret?: string | null;
};

type DocumentRow = {
  id: string;
  name: string | null;
  document_type: string | null;
  extracted_text: string | null;
  storage_path: string | null;
  status: string | null;
  source: string | null;
  created_at: string;
  dossier_id?: string | null;
  organisation_id?: string | null;
};

function buildPrompt(args: {
  ndaVariables: NdaVariablesRow | null;
  programText: string;
  cvText: string;
}) {
  const { ndaVariables, programText, cvText } = args;

  return `
Tu es un assistant métier expert en ingénierie pédagogique, conformité documentaire et cohérence formateur/programme.

Ta mission :
analyser le programme de formation proposé par le client et vérifier sa cohérence avec les diplômes / compétences / expérience visibles dans le CV ou les éléments fournis.

Tu dois choisir UNE seule décision parmi :
- programme_conforme
- thematique_ok_reformulation_necessaire
- thematique_incoherente_repositionnement_necessaire

Règles métier importantes :
- Les objectifs doivent être formulés en compétences applicables.
- Les titres de modules et chapitres doivent commencer par des verbes d’action à l’infinitif.
- Éviter "savoir", "comprendre" comme titre de module ou chapitre.
- Le programme reformulé doit être structuré avec :
  - un objectif global
  - des modules
  - pour chaque module : durée, objectif
  - pour chaque module : chapitres
- Le public visé doit être professionnel par défaut.
- Exception : si la logique relève explicitement de la création d’entreprise, le public non exclusivement professionnel peut être admis.
- Si la thématique voulue est incohérente avec les diplômes du formateur, proposer un repositionnement intelligent qui fasse le lien entre les compétences du formateur et le sujet souhaité.
- En cas de repositionnement, rester crédible, vendable et cohérent.
- Chaque objectif de module doit impérativement commencer par :
  "À l’issue de ce module, le bénéficiaire sera capable de..."

Contexte dossier :
${JSON.stringify(
  {
    formateur_nom: ndaVariables?.formateur_nom ?? null,
    formateur_prenom: ndaVariables?.formateur_prenom ?? null,
    formateur_email: ndaVariables?.formateur_email ?? null,
    intitule_formation: ndaVariables?.intitule_formation ?? null,
    duree_formation: ndaVariables?.duree_formation ?? null,
    modalite: ndaVariables?.modalite ?? null,
    nb_formateurs: ndaVariables?.nb_formateurs ?? null,
    ville: ndaVariables?.ville ?? null,
    code_postal: ndaVariables?.code_postal ?? null,
    region: ndaVariables?.region ?? null,
    siret: ndaVariables?.siret ?? null,
  },
  null,
  2,
)}

Programme source :
"""
${programText || "Aucun programme exploitable fourni."}
"""

CV / compétences source :
"""
${cvText || "Aucun CV exploitable fourni."}
"""

Consignes de sortie :
- justification claire et courte
- résumé agent exploitable immédiatement
- programme complet si reformulation ou repositionnement
- vigilance_points = liste concise
- modules = tableau structuré, même si vide en cas d’analyse insuffisante
`.trim();
}

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
  allDocs: DocumentRow[],
  wantedTypes: string[],
  dossierId: string,
) {
  const normalizedWanted = wantedTypes.map((type) =>
    normalizeNdaDocumentType(type),
  );

  const dossierDocs = sortNewestFirst(
    allDocs.filter(
      (doc) =>
        doc.dossier_id === dossierId &&
        normalizedWanted.includes(normalizeNdaDocumentType(doc.document_type)),
    ),
  );

  if (dossierDocs[0]) {
    return dossierDocs[0];
  }

  const globalDocs = sortNewestFirst(
    allDocs.filter(
      (doc) =>
        !doc.dossier_id &&
        normalizedWanted.includes(normalizeNdaDocumentType(doc.document_type)),
    ),
  );

  return globalDocs[0];
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY manquante." },
        { status: 500 },
      );
    }

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

    const supabase = await createClient();
    const body = await req.json();
    const dossierId = body?.dossierId as string | undefined;

    if (!dossierId) {
      return NextResponse.json(
        { error: "dossierId manquant." },
        { status: 400 },
      );
    }

    const { data: dossier, error: dossierError } = await supabase
      .from("dossiers")
      .select("id, organisation_id, title")
      .eq("id", dossierId)
      .maybeSingle();

    if (dossierError || !dossier) {
      return NextResponse.json(
        { error: "Dossier introuvable." },
        { status: 404 },
      );
    }

    const { data: ndaVariables, error: ndaError } = await supabase
      .from("nda_variables")
      .select("*")
      .eq("dossier_id", dossierId)
      .maybeSingle();

    if (ndaError) {
      return NextResponse.json({ error: ndaError.message }, { status: 500 });
    }

    const { createClient: createServiceClient } =
      await import("@supabase/supabase-js");
    const { extractTextFromBuffer } = await import("@/lib/documentText");

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

    const { data: documents, error: docsError } = await supabase
      .from("documents")
      .select(
        "id, name, document_type, extracted_text, storage_path, status, source, created_at, dossier_id, organisation_id",
      )
      .or(
        `dossier_id.eq.${dossierId},and(organisation_id.eq.${dossier.organisation_id},dossier_id.is.null)`,
      )
      .order("created_at", { ascending: false });

    if (docsError) {
      return NextResponse.json({ error: docsError.message }, { status: 500 });
    }

    const docs = (documents ?? []) as DocumentRow[];

    const selectedProgramDoc = pickPreferredDoc(
      docs,
      ["programme_formation", "programme", "programme_client"],
      dossierId,
    );

    const selectedCvDoc = pickPreferredDoc(
      docs,
      ["cv_formateur", "cv"],
      dossierId,
    );

    async function resolveDocText(doc: DocumentRow | undefined) {
      if (!doc) return "";

      if (doc.extracted_text?.trim()) {
        return doc.extracted_text.trim();
      }

      if (!doc.storage_path) {
        return "";
      }

      const { data, error } = await serviceSupabase.storage
        .from("documents")
        .download(doc.storage_path);

      if (error || !data) {
        console.error("download error", {
          docId: doc.id,
          name: doc.name,
          storagePath: doc.storage_path,
          error: error?.message ?? null,
        });
        return "";
      }

      try {
        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const extracted = await extractTextFromBuffer(
          buffer,
          doc.name ?? "document",
        );

        if (extracted?.trim()) {
          await supabase
            .from("documents")
            .update({ extracted_text: extracted })
            .eq("id", doc.id);
        }

        return extracted?.trim() ?? "";
      } catch (error) {
        console.error("extractTextFromBuffer error", {
          docId: doc.id,
          name: doc.name,
          error: error instanceof Error ? error.message : "Erreur inconnue",
        });
        return "";
      }
    }

    const [programText, cvText] = await Promise.all([
      resolveDocText(selectedProgramDoc),
      resolveDocText(selectedCvDoc),
    ]);

    console.log("PROGRAM DOC SELECTED:", selectedProgramDoc?.name ?? null);
    console.log("CV DOC SELECTED:", selectedCvDoc?.name ?? null);
    console.log("PROGRAM TEXT LENGTH:", programText.length);
    console.log("CV TEXT LENGTH:", cvText.length);

    const prompt = buildPrompt({
      ndaVariables: (ndaVariables as NdaVariablesRow | null) ?? null,
      programText,
      cvText,
    });

    const response = await openai.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "Tu réponds uniquement avec un JSON valide conforme au schéma demandé.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "program_analysis_result",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              decision: {
                type: "string",
                enum: [
                  "programme_conforme",
                  "thematique_ok_reformulation_necessaire",
                  "thematique_incoherente_repositionnement_necessaire",
                ],
              },
              justification: { type: "string" },
              agent_summary: { type: "string" },
              reformulated_title: { type: "string" },
              target_audience: { type: "string" },
              overall_objective: { type: "string" },
              recommended_positioning: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
              vigilance_points: {
                type: "array",
                items: { type: "string" },
              },
              modules: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    duration: { type: "string" },
                    objective: { type: "string" },
                    chapters: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          title: { type: "string" },
                        },
                        required: ["title"],
                      },
                    },
                  },
                  required: ["title", "duration", "objective", "chapters"],
                },
              },
            },
            required: [
              "decision",
              "justification",
              "agent_summary",
              "reformulated_title",
              "target_audience",
              "overall_objective",
              "recommended_positioning",
              "vigilance_points",
              "modules",
            ],
          },
        },
      },
    });

    const rawText = response.output_text;
    const parsed = JSON.parse(rawText);

    const insertPayload = {
      dossier_id: dossierId,
      analysis_type: "programme_review",
      status: "completed",
      source_program_text: programText || null,
      source_cv_text: cvText || null,
      source_context_json: {
        dossier_title: dossier.title ?? null,
        nda_variables: ndaVariables ?? null,
      },
      decision: parsed.decision ?? null,
      justification: parsed.justification ?? null,
      agent_summary: parsed.agent_summary ?? null,
      reformulated_title: parsed.reformulated_title ?? null,
      target_audience: parsed.target_audience ?? null,
      overall_objective: parsed.overall_objective ?? null,
      recommended_positioning: parsed.recommended_positioning ?? null,
      vigilance_points: parsed.vigilance_points ?? [],
      modules: parsed.modules ?? [],
      raw_result_json: parsed,
      model_name: "gpt-4.1",
      prompt_version: "program_analysis_v2",
    };

    const { data: savedAnalysis, error: saveError } = await supabase
      .from("program_ai_analyses")
      .insert(insertPayload)
      .select("*")
      .single();

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      analysis: savedAnalysis,
      debug: {
        selectedProgramDocName: selectedProgramDoc?.name ?? null,
        selectedCvDocName: selectedCvDoc?.name ?? null,
        programTextLength: programText.length,
        cvTextLength: cvText.length,
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
