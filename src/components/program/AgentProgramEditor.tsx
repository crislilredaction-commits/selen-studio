"use client";

import { useEffect, useMemo, useState } from "react";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";
import SelenBadge from "@/components/ui/SelenBadge";

type ProgramChapter = {
  title: string;
  objective: string;
};

type ProgramModule = {
  title: string;
  duration: string;
  objective: string;
  chapters: ProgramChapter[];
};

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
  modules: ProgramModule[] | null;
  created_at: string;
};

type ProgramVersion = {
  id: string;
  source_analysis_id: string | null;
  title: string | null;
  target_audience: string | null;
  overall_objective: string | null;
  recommended_positioning: string | null;
  justification: string | null;
  agent_comment: string | null;
  vigilance_points: string[] | null;
  modules: ProgramModule[] | null;
  created_at: string;
};

type Props = {
  dossierId: string;
  initialAnalysis?: ProgramAnalysis | null;
  initialVersion?: ProgramVersion | null;
};

function toPrettyModules(modules: ProgramModule[] | null | undefined): string {
  if (!modules?.length) return "";

  return modules
    .map((module, index) => {
      const chaptersText = module.chapters?.length
        ? module.chapters
            .map(
              (chapter, chapterIndex) =>
                `    ${chapterIndex + 1}. ${chapter.title}`,
            )
            .join("\n")
        : "    Aucun chapitre";

      return [
        `MODULE ${index + 1} : ${module.title}`,
        `Durée : ${module.duration}`,
        `Objectif : ${module.objective}`,
        `Chapitres :`,
        chaptersText,
      ].join("\n");
    })
    .join("\n\n");
}

function parseModulesFromText(input: string): ProgramModule[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const blocks = trimmed
    .split(/\n\s*\n(?=MODULE\s+\d+\s*:)/i)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block) => {
    const lines = block.split("\n").map((line) => line.trim());

    const title =
      lines
        .find((line) => /^MODULE\s+\d+\s*:/i.test(line))
        ?.replace(/^MODULE\s+\d+\s*:\s*/i, "") ?? "";

    const duration =
      lines
        .find((line) => /^Durée\s*:/i.test(line))
        ?.replace(/^Durée\s*:\s*/i, "") ?? "";

    const objective =
      lines
        .find((line) => /^Objectif\s*:/i.test(line))
        ?.replace(/^Objectif\s*:\s*/i, "") ?? "";

    const chapterLines = lines.filter((line) => /^\d+\.\s+/i.test(line));
    const chapters: ProgramChapter[] = [];

    for (let i = 0; i < chapterLines.length; i++) {
      const currentLine = chapterLines[i];
      const chapterTitle = currentLine.replace(/^\d+\.\s+/i, "").trim();

      const currentIndex = lines.findIndex((line) => line === currentLine);
      const nextLine = currentIndex >= 0 ? lines[currentIndex + 1] : "";
      const chapterObjective =
        nextLine?.replace(/^Objectif\s*:\s*/i, "").trim() ?? "";

      chapters.push({
        title: chapterTitle,
        objective: chapterObjective,
      });
    }

    return {
      title,
      duration,
      objective,
      chapters,
    };
  });
}

export default function AgentProgramEditor({
  dossierId,
  initialAnalysis = null,
  initialVersion = null,
}: Props) {
  const initialState = useMemo(() => {
    if (initialVersion) {
      return {
        sourceAnalysisId: initialVersion.source_analysis_id,
        title: initialVersion.title ?? "",
        targetAudience: initialVersion.target_audience ?? "",
        overallObjective: initialVersion.overall_objective ?? "",
        recommendedPositioning: initialVersion.recommended_positioning ?? "",
        justification: initialVersion.justification ?? "",
        agentComment: initialVersion.agent_comment ?? "",
        vigilancePointsText: (initialVersion.vigilance_points ?? []).join("\n"),
        modulesText: toPrettyModules(initialVersion.modules ?? []),
      };
    }

    if (initialAnalysis) {
      return {
        sourceAnalysisId: initialAnalysis.id,
        title: initialAnalysis.reformulated_title ?? "",
        targetAudience: initialAnalysis.target_audience ?? "",
        overallObjective: initialAnalysis.overall_objective ?? "",
        recommendedPositioning: initialAnalysis.recommended_positioning ?? "",
        justification: initialAnalysis.justification ?? "",
        agentComment: "",
        vigilancePointsText: (initialAnalysis.vigilance_points ?? []).join(
          "\n",
        ),
        modulesText: toPrettyModules(initialAnalysis.modules ?? []),
      };
    }

    return {
      sourceAnalysisId: null as string | null,
      title: "",
      targetAudience: "",
      overallObjective: "",
      recommendedPositioning: "",
      justification: "",
      agentComment: "",
      vigilancePointsText: "",
      modulesText: "",
    };
  }, [initialAnalysis, initialVersion]);

  const [title, setTitle] = useState(initialState.title);
  const [targetAudience, setTargetAudience] = useState(
    initialState.targetAudience,
  );
  const [overallObjective, setOverallObjective] = useState(
    initialState.overallObjective,
  );
  const [recommendedPositioning, setRecommendedPositioning] = useState(
    initialState.recommendedPositioning,
  );
  const [justification, setJustification] = useState(
    initialState.justification,
  );
  const [agentComment, setAgentComment] = useState(initialState.agentComment);
  const [vigilancePointsText, setVigilancePointsText] = useState(
    initialState.vigilancePointsText,
  );
  const [modulesText, setModulesText] = useState(initialState.modulesText);

  const [saving, setSaving] = useState(false);
  const [sendingToClient, setSendingToClient] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setTitle(initialState.title);
    setTargetAudience(initialState.targetAudience);
    setOverallObjective(initialState.overallObjective);
    setRecommendedPositioning(initialState.recommendedPositioning);
    setJustification(initialState.justification);
    setAgentComment(initialState.agentComment);
    setVigilancePointsText(initialState.vigilancePointsText);
    setModulesText(initialState.modulesText);
  }, [initialState]);

  useEffect(() => {
    if (initialAnalysis || initialVersion) {
      setIsOpen(true);
    }
  }, [initialAnalysis, initialVersion]);

  function buildPayload() {
    const vigilancePoints = vigilancePointsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const modules = parseModulesFromText(modulesText);

    return {
      dossierId,
      sourceAnalysisId:
        initialVersion?.source_analysis_id ?? initialAnalysis?.id ?? null,
      title: title.trim() || null,
      targetAudience: targetAudience.trim() || null,
      overallObjective: overallObjective.trim() || null,
      recommendedPositioning: recommendedPositioning.trim() || null,
      justification: justification.trim() || null,
      agentComment: agentComment.trim() || null,
      vigilancePoints,
      modules,
    };
  }

  async function handleSave() {
    try {
      setSaving(true);
      setSuccessMessage(null);
      setErrorMessage(null);

      const res = await fetch("/agent/api/program/save-version", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload()),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error ?? "Erreur lors de l’enregistrement.");
      }

      setSuccessMessage("Version agent enregistrée avec succès.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Erreur inconnue.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSendToClient() {
    try {
      setSendingToClient(true);
      setSuccessMessage(null);
      setErrorMessage(null);

      console.log("DOSSIER ID envoyé =", dossierId);

      const res = await fetch("/agent/api/program/send-to-client", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload()),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error ?? "Erreur lors de l’envoi au client.");
      }

      setSuccessMessage("Programme envoyé au client avec succès.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Erreur inconnue.",
      );
    } finally {
      setSendingToClient(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--selen-bg3)",
    border: "1px solid var(--selen-border)",
    borderRadius: "var(--radius-sm)",
    padding: "10px 12px",
    color: "var(--selen-text)",
    fontSize: 13,
    fontFamily: "var(--font-body)",
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: "var(--selen-text3)",
    marginBottom: 6,
    display: "block",
  };

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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <SelenCardTitle>Programme de formation</SelenCardTitle>
          {initialVersion ? (
            <SelenBadge variant="info" dot>
              Version agent chargée
            </SelenBadge>
          ) : initialAnalysis ? (
            <SelenBadge variant="warn" dot>
              Prérempli depuis l’analyse IA
            </SelenBadge>
          ) : (
            <SelenBadge variant="neutral" dot>
              Vide
            </SelenBadge>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          style={{
            background: "var(--selen-bg3)",
            border: "1px solid var(--selen-border)",
            color: "var(--selen-text)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "var(--font-body)",
          }}
        >
          {isOpen ? "Masquer" : "Afficher"}
        </button>
      </div>

      <p
        style={{
          fontSize: 12,
          color: "var(--selen-text3)",
          lineHeight: 1.5,
          marginBottom: 16,
        }}
      >
        Ici, l’agent peut relire, corriger et structurer le programme avant
        envoi au client.
      </p>

      {!isOpen ? null : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div>
              <label style={labelStyle}>Intitulé</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={inputStyle}
                placeholder="Intitulé du programme"
              />
            </div>

            <div>
              <label style={labelStyle}>Public visé</label>
              <input
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                style={inputStyle}
                placeholder="Professionnels..."
              />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Objectif global</label>
            <textarea
              value={overallObjective}
              onChange={(e) => setOverallObjective(e.target.value)}
              style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
              placeholder="Objectif global reformulé"
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Positionnement recommandé</label>
            <textarea
              value={recommendedPositioning}
              onChange={(e) => setRecommendedPositioning(e.target.value)}
              style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
              placeholder="Repositionnement proposé si nécessaire"
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Justification</label>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              style={{ ...inputStyle, minHeight: 100, resize: "vertical" }}
              placeholder="Pourquoi ce programme est reformulé ou repositionné"
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Commentaire agent</label>
            <textarea
              value={agentComment}
              onChange={(e) => setAgentComment(e.target.value)}
              style={{ ...inputStyle, minHeight: 100, resize: "vertical" }}
              placeholder="Commentaire à transmettre au client"
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>
              Points de vigilance (1 ligne = 1 point)
            </label>
            <textarea
              value={vigilancePointsText}
              onChange={(e) => setVigilancePointsText(e.target.value)}
              style={{ ...inputStyle, minHeight: 100, resize: "vertical" }}
              placeholder={`Objectifs à préciser\nDurées à harmoniser\nVocabulaire à professionnaliser`}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>
              Modules et chapitres (format texte éditable)
            </label>
            <textarea
              value={modulesText}
              onChange={(e) => setModulesText(e.target.value)}
              style={{
                ...inputStyle,
                minHeight: 360,
                resize: "vertical",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                lineHeight: 1.55,
              }}
              placeholder={`MODULE 1 : Structurer une formation professionnelle
Durée : 7 heures
Objectif : Construire une architecture pédagogique cohérente
Chapitres :
    1. Définir l’objectif global
       Objectif : Formuler un objectif global applicable
    2. Découper la progression en modules
       Objectif : Organiser la montée en compétence`}
            />
          </div>

          {errorMessage ? (
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
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div
              style={{
                fontSize: 12,
                color: "var(--selen-success, #7eb787)",
                background: "rgba(126, 183, 135, 0.08)",
                border: "1px solid rgba(126, 183, 135, 0.25)",
                borderRadius: "var(--radius-sm)",
                padding: "10px 12px",
                marginBottom: 12,
              }}
            >
              {successMessage}
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <SelenButton
              variant="ghost"
              size="sm"
              onClick={handleSave}
              disabled={saving || sendingToClient}
            >
              {saving ? "Enregistrement..." : "💾 Enregistrer"}
            </SelenButton>

            <SelenButton
              variant="primary"
              size="sm"
              onClick={handleSendToClient}
              disabled={saving || sendingToClient}
            >
              {sendingToClient ? "Envoi..." : "📤 Envoyer au client"}
            </SelenButton>
          </div>
        </>
      )}
    </SelenCard>
  );
}
