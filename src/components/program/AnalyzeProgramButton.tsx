"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";
import SelenBadge from "@/components/ui/SelenBadge";

type ProgramAnalysis = {
  id: string;
  decision: string | null;
  justification: string | null;
  agent_summary: string | null;
  reformulated_title: string | null;
  target_audience: string | null;
  overall_objective: string | null;
  recommended_positioning: string | null;
  vigilance_points: string[] | null;
  modules: unknown[] | null;
  raw_result_json?: unknown;
  created_at: string;
};

type DeterministicControl = {
  key?: string;
  label?: string;
  status?: "ok" | "warning" | "missing";
  message?: string;
};

type EnrichedAnalysis = {
  quick_diagnostic?: string;
  deterministic_controls?: DeterministicControl[];
  source_used?: string[];
  conformity_points?: string[];
  verification_points?: string[];
  risk_points?: string[];
  questions_to_ask?: string[];
  recommendations?: string[];
  proposed_reformulated_program?: string;
};

type Props = {
  dossierId: string;
  initialAnalysis?: ProgramAnalysis | null;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function getEnrichedAnalysis(analysis: ProgramAnalysis): EnrichedAnalysis {
  const raw = asObject(analysis.raw_result_json);
  if (!raw) return {};

  return {
    quick_diagnostic:
      typeof raw.quick_diagnostic === "string" ? raw.quick_diagnostic : undefined,
    deterministic_controls: Array.isArray(raw.deterministic_controls)
      ? raw.deterministic_controls
          .map((item) => asObject(item))
          .filter((item): item is Record<string, unknown> => Boolean(item))
          .map((item) => ({
            key: typeof item.key === "string" ? item.key : undefined,
            label: typeof item.label === "string" ? item.label : undefined,
            status:
              item.status === "ok" ||
              item.status === "warning" ||
              item.status === "missing"
                ? item.status
                : undefined,
            message: typeof item.message === "string" ? item.message : undefined,
          }))
      : [],
    source_used: stringArray(raw.source_used),
    conformity_points: stringArray(raw.conformity_points),
    verification_points: stringArray(raw.verification_points),
    risk_points: stringArray(raw.risk_points),
    questions_to_ask: stringArray(raw.questions_to_ask),
    recommendations: stringArray(raw.recommendations),
    proposed_reformulated_program:
      typeof raw.proposed_reformulated_program === "string"
        ? raw.proposed_reformulated_program
        : undefined,
  };
}

function getQuickDiagnosticLabel(value?: string | null) {
  switch (value) {
    case "conforme":
      return "🟢 Conforme";
    case "a_verifier":
      return "🟠 À vérifier";
    case "risque_eleve_refus":
      return "🔴 Risque élevé de refus";
    case "insufficient_information":
      return "⚪ Informations insuffisantes";
    default:
      return null;
  }
}

function getControlStatusLabel(status?: DeterministicControl["status"]) {
  if (status === "ok") return "ok";
  if (status === "warning") return "à vérifier";
  return "manquant";
}

function renderListBlock(title: string, items?: string[]) {
  if (!items?.length) return null;

  return (
    <div style={blockStyle}>
      <div style={blockTitleStyle}>{title}</div>
      <ul style={listStyle}>
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

const blockStyle: CSSProperties = {
  background: "var(--selen-bg3)",
  border: "1px solid var(--selen-border)",
  borderRadius: "var(--radius-sm)",
  padding: "12px 14px",
};

const blockTitleStyle: CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--selen-text3)",
  marginBottom: 8,
  fontWeight: 700,
};

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  fontSize: 12,
  color: "var(--selen-text)",
  lineHeight: 1.55,
};

function getDecisionLabel(decision?: string | null) {
  switch (decision) {
    case "programme_conforme":
      return "Programme conforme";
    case "thematique_ok_reformulation_necessaire":
      return "Reformulation nécessaire";
    case "thematique_incoherente_repositionnement_necessaire":
      return "Repositionnement nécessaire";
    case "insufficient_information":
      return "Informations insuffisantes";
    default:
      return "Analyse";
  }
}

function getDecisionVariant(decision?: string | null) {
  switch (decision) {
    case "programme_conforme":
      return "success";
    case "thematique_ok_reformulation_necessaire":
      return "warn";
    case "thematique_incoherente_repositionnement_necessaire":
      return "danger";
    case "insufficient_information":
      return "neutral";
    default:
      return "info";
  }
}

export default function AnalyzeProgramButton({
  dossierId,
  initialAnalysis = null,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ProgramAnalysis | null>(
    initialAnalysis,
  );
  const [debugInfo, setDebugInfo] = useState<{
    cvCandidatesCount?: number;
    programCandidatesCount?: number;
    selectedProgramDocName?: string | null;
    selectedProgramDocType?: string | null;
    selectedProgramDocRole?: string | null;
    selectedProgramReviewStatus?: string | null;
    selectedProgramStoragePath?: string | null;
    selectedProgramExtractionSource?: string | null;
    selectedProgramExtractionError?: string | null;
    selectedCvDocName?: string | null;
    selectedCvExtractionSource?: string | null;
    selectedCvExtractionError?: string | null;
    programTextLength?: number;
    cvTextLength?: number;
  } | null>(null);

  const router = useRouter();
  const enrichedAnalysis = analysis ? getEnrichedAnalysis(analysis) : null;
  const quickDiagnosticLabel = enrichedAnalysis
    ? getQuickDiagnosticLabel(enrichedAnalysis.quick_diagnostic)
    : null;

  async function handleAnalyze() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/agent/api/program/analyse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dossierId }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) setDebugInfo(data?.debug ?? null);

      if (!res.ok) {
        throw new Error(data?.error ?? "Erreur lors de l’analyse IA.");
      }

      setAnalysis(data?.analysis ?? null);
      setDebugInfo(data?.debug ?? null);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SelenCard>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <SelenCardTitle>Analyse IA du programme</SelenCardTitle>

        <SelenButton
          variant="primary"
          size="sm"
          onClick={handleAnalyze}
          disabled={loading}
        >
          {loading
            ? "✨ Analyse magique en cours..."
            : "✨ Analyser le programme"}
        </SelenButton>
      </div>

      <p
        style={{
          fontSize: 12,
          color: "var(--selen-text3)",
          lineHeight: 1.5,
          marginBottom: 14,
        }}
      >
        Lance une analyse IA du CV et du programme afin d’évaluer la cohérence
        pédagogique et de préremplir automatiquement le programme éditable.
      </p>

      {loading ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 14,
            padding: "12px 14px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid rgba(212, 159, 63, 0.25)",
            background: "rgba(212, 159, 63, 0.08)",
            fontSize: 12,
            color: "var(--selen-gold2)",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              gap: 4,
              fontSize: 16,
            }}
          >
            <span className="sparkle-magic">✨</span>
            <span className="sparkle-magic sparkle-delay-1">⭐</span>
            <span className="sparkle-magic sparkle-delay-2">✨</span>
          </span>
          <span>La magie opère... analyse du CV et du programme en cours.</span>
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--selen-danger)",
            background: "rgba(185, 78, 72, 0.08)",
            border: "1px solid rgba(185, 78, 72, 0.25)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 12px",
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      ) : null}

      {debugInfo ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--selen-text2)",
            background: "var(--selen-bg3)",
            border: "1px solid var(--selen-border)",
            borderRadius: "var(--radius-sm)",
            padding: "12px 14px",
            marginBottom: 12,
            lineHeight: 1.6,
          }}
        >
          <div>
            <strong>Candidats CV trouvés :</strong>{" "}
            {debugInfo.cvCandidatesCount ?? 0}
          </div>
          <div>
            <strong>CV choisi :</strong>{" "}
            {debugInfo.selectedCvDocName ?? "aucun"}
          </div>
          <div>
            <strong>Source extraction CV :</strong>{" "}
            {debugInfo.selectedCvExtractionSource ?? "non renseignée"}
          </div>
          {debugInfo.selectedCvExtractionError ? (
            <div>
              <strong>Erreur extraction CV :</strong>{" "}
              {debugInfo.selectedCvExtractionError}
            </div>
          ) : null}
          <div>
            <strong>Candidats programme trouvés :</strong>{" "}
            {debugInfo.programCandidatesCount ?? 0}
          </div>
          <div>
            <strong>Programme choisi :</strong>{" "}
            {debugInfo.selectedProgramDocName ?? "aucun"}
          </div>
          <div>
            <strong>Type programme :</strong>{" "}
            {debugInfo.selectedProgramDocType ?? "non renseigné"}
          </div>
          <div>
            <strong>Rôle programme :</strong>{" "}
            {debugInfo.selectedProgramDocRole ?? "non renseigné"}
          </div>
          <div>
            <strong>Statut revue programme :</strong>{" "}
            {debugInfo.selectedProgramReviewStatus ?? "non renseigné"}
          </div>
          <div>
            <strong>Storage programme :</strong>{" "}
            {debugInfo.selectedProgramStoragePath ?? "non renseigné"}
          </div>
          <div>
            <strong>Source extraction programme :</strong>{" "}
            {debugInfo.selectedProgramExtractionSource ?? "non renseignée"}
          </div>
          {debugInfo.selectedProgramExtractionError ? (
            <div>
              <strong>Erreur extraction programme :</strong>{" "}
              {debugInfo.selectedProgramExtractionError}
            </div>
          ) : null}
          <div>
            <strong>Longueur texte CV :</strong> {debugInfo.cvTextLength ?? 0}
          </div>
          <div>
            <strong>Longueur texte programme :</strong>{" "}
            {debugInfo.programTextLength ?? 0}
          </div>
        </div>
      ) : null}

      {!analysis ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--selen-text3)",
            background: "var(--selen-bg3)",
            border: "1px solid var(--selen-border)",
            borderRadius: "var(--radius-sm)",
            padding: "12px 14px",
          }}
        >
          Aucune analyse enregistrée pour le moment.
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <SelenBadge variant={getDecisionVariant(analysis.decision)} dot>
              {getDecisionLabel(analysis.decision)}
            </SelenBadge>

            <span
              style={{
                fontSize: 11,
                color: "var(--selen-text3)",
              }}
            >
              {new Date(analysis.created_at).toLocaleString("fr-FR")}
            </span>
          </div>

          {analysis.agent_summary ? (
            <div>
              <div
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--selen-text3)",
                  marginBottom: 4,
                }}
              >
                Résumé agent
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--selen-text)",
                  lineHeight: 1.55,
                }}
              >
                {analysis.agent_summary}
              </div>
            </div>
          ) : (
            <div
              style={{
                fontSize: 12,
                color: "var(--selen-text3)",
                background: "var(--selen-bg3)",
                border: "1px solid var(--selen-border)",
                borderRadius: "var(--radius-sm)",
                padding: "12px 14px",
              }}
            >
              Analyse enregistrée, mais aucun résumé agent n’a été généré.
            </div>
          )}

          {quickDiagnosticLabel ? (
            <div style={blockStyle}>
              <div style={blockTitleStyle}>Diagnostic rapide</div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--selen-text)",
                }}
              >
                {quickDiagnosticLabel}
              </div>
            </div>
          ) : null}

          {enrichedAnalysis?.deterministic_controls?.length ? (
            <div style={blockStyle}>
              <div style={blockTitleStyle}>Contrôles déterministes</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 8,
                }}
              >
                {enrichedAnalysis.deterministic_controls.map((control) => (
                  <div
                    key={control.key ?? control.label}
                    style={{
                      border: "1px solid var(--selen-border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "9px 10px",
                      background: "var(--selen-bg2)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        alignItems: "center",
                        marginBottom: 4,
                      }}
                    >
                      <strong
                        style={{
                          fontSize: 12,
                          color: "var(--selen-text)",
                        }}
                      >
                        {control.label ?? "Contrôle"}
                      </strong>
                      <SelenBadge
                        variant={
                          control.status === "ok"
                            ? "success"
                            : control.status === "warning"
                              ? "warn"
                              : "danger"
                        }
                      >
                        {getControlStatusLabel(control.status)}
                      </SelenBadge>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--selen-text2)",
                        lineHeight: 1.45,
                      }}
                    >
                      {control.message}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {renderListBlock("🟢 Conforme", enrichedAnalysis?.conformity_points)}
          {renderListBlock("🟠 À vérifier", enrichedAnalysis?.verification_points)}
          {renderListBlock("🔴 Risques identifiés", enrichedAnalysis?.risk_points)}
          {renderListBlock(
            "Questions à poser au client",
            enrichedAnalysis?.questions_to_ask,
          )}
          {renderListBlock("Recommandations", enrichedAnalysis?.recommendations)}

          {enrichedAnalysis?.proposed_reformulated_program?.trim() ? (
            <div style={blockStyle}>
              <div style={blockTitleStyle}>Programme reformulé proposé</div>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 12,
                  color: "var(--selen-text)",
                  lineHeight: 1.55,
                }}
              >
                {enrichedAnalysis.proposed_reformulated_program}
              </div>
            </div>
          ) : null}

          {renderListBlock("Source utilisée", enrichedAnalysis?.source_used)}
        </div>
      )}
    </SelenCard>
  );
}
