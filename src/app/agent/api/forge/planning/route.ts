import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireStudioAgent } from "@/lib/server/studioAuth";

let openaiClient: OpenAI | null = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY manquante.");
  }
  openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

function cleanOptional(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  try {
    const auth = await requireStudioAgent();
    if (!auth.ok) return auth.response;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Le service d’analyse Cody n’est pas configuré." },
        { status: 503 },
      );
    }

    const body = await request.json();
    const sourceRequest = cleanOptional(body?.sourceRequest, 30_000);
    const sourceContext = cleanOptional(body?.sourceContext, 12_000);
    const sourceConstraints = cleanOptional(body?.sourceConstraints, 12_000);
    const requestedTitle = cleanOptional(body?.requestedTitle, 240);

    if (!sourceRequest) {
      return NextResponse.json(
        { error: "La demande ou le cahier des charges est obligatoire." },
        { status: 400 },
      );
    }

    const prompt = `
Tu es Cody, agent développeur de Selen Studio. Tu cadres une mission avant toute
exécution. Tu ne dois proposer aucune action déjà réalisée et tu ne dois jamais
prétendre avoir modifié un fichier, lancé une commande ou appliqué une migration.

Analyse la demande ci-dessous et produis un cadrage technique prudent, actionnable
et spécifique au dépôt Next.js selen-studio.

Règles :
- distingue strictement les questions bloquantes, les questions non bloquantes,
  les hypothèses raisonnables et les recommandations facultatives ;
- une question est bloquante uniquement si aucune implémentation sûre ne peut
  commencer sans la réponse ;
- n’invente aucun secret, accès, schéma distant ou résultat de test ;
- cite les zones probables du dépôt sans affirmer qu’elles existent ;
- inclus les vérifications utiles parmi lint, build, tests, sécurité, responsive,
  migrations et production selon le contexte ;
- le plan doit rester au stade du cadrage : aucune exécution ;
- le Markdown doit reprendre toutes les rubriques structurées du JSON.

Titre facultatif fourni :
${requestedTitle || "(aucun)"}

Demande source :
${sourceRequest}

Contexte complémentaire :
${sourceContext || "(aucun)"}

Contraintes ou exclusions fournies :
${sourceConstraints || "(aucune)"}
`;

    const response = await getOpenAIClient().responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "system",
          content: [{
            type: "input_text",
            text: "Réponds uniquement avec un JSON valide conforme au schéma.",
          }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: prompt }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "forge_mission_plan",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "proposed_title", "summary", "functional_objective",
              "included_scope", "excluded_scope", "constraints",
              "repository_areas", "technical_dependencies", "risks",
              "blocking_questions", "non_blocking_questions", "assumptions",
              "recommendations", "acceptance_criteria", "execution_steps",
              "verification_plan", "markdown_content",
            ],
            properties: {
              proposed_title: { type: "string" },
              summary: { type: "string" },
              functional_objective: { type: "string" },
              included_scope: { type: "array", items: { type: "string" } },
              excluded_scope: { type: "array", items: { type: "string" } },
              constraints: { type: "array", items: { type: "string" } },
              repository_areas: { type: "array", items: { type: "string" } },
              technical_dependencies: { type: "array", items: { type: "string" } },
              risks: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["level", "label", "detail"],
                  properties: {
                    level: {
                      type: "string",
                      enum: ["low", "medium", "high", "critical"],
                    },
                    label: { type: "string" },
                    detail: { type: "string" },
                  },
                },
              },
              blocking_questions: { type: "array", items: { type: "string" } },
              non_blocking_questions: { type: "array", items: { type: "string" } },
              assumptions: { type: "array", items: { type: "string" } },
              recommendations: { type: "array", items: { type: "string" } },
              acceptance_criteria: { type: "array", items: { type: "string" } },
              execution_steps: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["position", "title", "detail"],
                  properties: {
                    position: { type: "integer", minimum: 1 },
                    title: { type: "string" },
                    detail: { type: "string" },
                  },
                },
              },
              verification_plan: { type: "array", items: { type: "string" } },
              markdown_content: { type: "string" },
            },
          },
        },
      },
    });

    if (!response.output_text) {
      return NextResponse.json(
        { error: "Cody n’a pas produit de cadrage exploitable." },
        { status: 502 },
      );
    }

    return NextResponse.json({ plan: JSON.parse(response.output_text) });
  } catch (error) {
    console.error("Forge planning analysis failed", error);
    return NextResponse.json(
      { error: "La génération du cadrage a échoué." },
      { status: 500 },
    );
  }
}
