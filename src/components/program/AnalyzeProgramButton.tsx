"use client";

import { useState } from "react";
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
  created_at: string;
};

type Props = {
  dossierId: string;
  initialAnalysis?: ProgramAnalysis | null;
};

function getDecisionLabel(decision?: string | null) {
  switch (decision) {
    case "programme_conforme":
      return "Programme conforme";
    case "thematique_ok_reformulation_necessaire":
      return "Reformulation nécessaire";
    case "thematique_incoherente_repositionnement_necessaire":
      return "Repositionnement nécessaire";
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
        </div>
      )}
    </SelenCard>
  );
}
