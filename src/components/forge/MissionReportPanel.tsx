"use client";

import {
  Check,
  Clipboard,
  Download,
  FileText,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  Mission,
  MissionReport,
  MissionReportStatus,
  ReportCheckStatus,
} from "@/lib/forge/types";

const statusLabels: Record<MissionReportStatus, string> = {
  pending: "En attente",
  generating: "Génération…",
  ready: "Prêt",
  failed: "Échec",
  outdated: "Obsolète",
};

const checkLabels: Record<ReportCheckStatus, string> = {
  pending: "En attente",
  passed: "Réussi",
  failed: "Échec",
  warnings: "Avec avertissements",
  not_run: "Non exécuté",
};

function qualityLabel(status?: ReportCheckStatus): string {
  return status ? checkLabels[status] : "Non renseigné";
}

function MarkdownSections({ content }: { content: string }) {
  const sections = useMemo(() => {
    const [introduction, ...parts] = content.split(/^## /m);
    return {
      introduction: introduction.trim(),
      parts: parts.map((part) => {
        const [heading, ...body] = part.split("\n");
        return { heading: heading.trim(), body: body.join("\n").trim() };
      }),
    };
  }, [content]);

  return (
    <div className="forge-report-markdown">
      {sections.introduction && <pre>{sections.introduction}</pre>}
      {sections.parts.map((section) => (
        <details key={section.heading}>
          <summary>{section.heading}</summary>
          <pre>{section.body}</pre>
        </details>
      ))}
    </div>
  );
}

export default function MissionReportPanel({
  mission,
  report,
  generating,
  onGenerate,
}: {
  mission: Mission;
  report?: MissionReport;
  generating: boolean;
  onGenerate: () => void;
}) {
  const [showFull, setShowFull] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const reportStatus: MissionReportStatus = generating ? "generating" : report?.status ?? "pending";
  const needsAttention = !report || report.status === "outdated" || report.status === "failed";

  async function copyReport() {
    if (!report?.markdownContent) return;
    try {
      await navigator.clipboard.writeText(report.markdownContent);
      setCopyFeedback("Rapport copié.");
    } catch {
      setCopyFeedback("La copie a échoué.");
    }
  }

  function downloadReport() {
    if (!report?.markdownContent) return;
    const blob = new Blob([report.markdownContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeTitle = mission.title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    link.href = url;
    link.download = `rapport-cody-${safeTitle || mission.id}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="forge-detail__section forge-report">
      <div className="forge-report__heading">
        <div>
          <p className="forge-eyebrow"><FileText size={14} /> Livrable technique</p>
          <h3>Rapport de Cody</h3>
        </div>
        <span className={`forge-report-status forge-report-status--${reportStatus}`}>
          {reportStatus === "ready"
            ? <Check size={14} />
            : reportStatus === "generating"
              ? <RefreshCw size={14} />
              : <TriangleAlert size={14} />}
          {statusLabels[reportStatus]}
        </span>
      </div>

      {needsAttention && (
        <p className="forge-report__notice">
          {!report
            ? "Aucun rapport n’est encore associé à cette mission."
            : report.status === "outdated"
              ? "La mission a changé depuis la dernière génération."
              : "La dernière génération du rapport a échoué."}
        </p>
      )}

      {report && (
        <>
          <p className="forge-report__summary">{report.summary || "Aucun résumé renseigné."}</p>
          <div className="forge-report-grid">
            <div><span>Généré le</span><strong>{report.generatedAt ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(report.generatedAt)) : "Non généré"}</strong></div>
            <div><span>Fichiers créés</span><strong>{report.filesCreated}</strong></div>
            <div><span>Fichiers modifiés</span><strong>{report.filesModified}</strong></div>
            <div><span>Lint</span><strong>{qualityLabel(report.lintStatus)}</strong></div>
            <div><span>Build</span><strong>{qualityLabel(report.buildStatus)}</strong></div>
            <div><span>Tests</span><strong>{qualityLabel(report.testsStatus)}</strong></div>
            <div><span>Branche</span><strong>{report.gitBranch || mission.branch || "Non renseignée"}</strong></div>
            <div><span>Commit</span><strong>{report.commitSha || "Non renseigné"}</strong></div>
          </div>

          <div className="forge-report-columns">
            <div>
              <h4>Risques connus</h4>
              {report.risks.length ? <ul>{report.risks.map((risk) => <li key={`${risk.level}-${risk.description}`}>{risk.level} · {risk.description}</li>)}</ul> : <p>Aucun risque renseigné.</p>}
            </div>
            <div>
              <h4>Points à tester</h4>
              {report.manualTestItems.length ? <ul>{report.manualTestItems.map((item) => <li key={item.label}>{item.state} · {item.label}</li>)}</ul> : <p>Aucun point renseigné.</p>}
            </div>
            <div>
              <h4>Limites</h4>
              {report.limitations.length ? <ul>{report.limitations.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Aucune limite renseignée.</p>}
            </div>
          </div>

          <div className="forge-report__recommendation">
            <span>Prochaine étape recommandée</span>
            <p>{report.nextRecommendation || "Aucune recommandation renseignée."}</p>
          </div>

          {(report.previewUrl || mission.previewUrl) && (
            <a className="forge-report__preview" href={report.previewUrl || mission.previewUrl} target="_blank" rel="noreferrer">
              Ouvrir la Preview
            </a>
          )}
        </>
      )}

      <div className="forge-report-actions">
        <button className="forge-button forge-button--primary" type="button" onClick={onGenerate} disabled={generating}>
          {generating ? <RefreshCw className="forge-spin" size={15} /> : <FileText size={15} />}
          {report ? "Régénérer le rapport" : "Générer le rapport de démonstration"}
        </button>
        <button className="forge-button forge-button--secondary" type="button" onClick={() => setShowFull((value) => !value)} disabled={!report?.markdownContent}>
          <FileText size={15} /> {showFull ? "Masquer le rapport complet" : "Voir le rapport complet"}
        </button>
        <button className="forge-button forge-button--secondary" type="button" onClick={() => void copyReport()} disabled={!report?.markdownContent}>
          <Clipboard size={15} /> Copier le rapport
        </button>
        <button className="forge-button forge-button--secondary" type="button" onClick={downloadReport} disabled={!report?.markdownContent}>
          <Download size={15} /> Télécharger le rapport .md
        </button>
      </div>

      {copyFeedback && <p className="forge-report__feedback" role="status">{copyFeedback}</p>}
      {showFull && report?.markdownContent && <MarkdownSections content={report.markdownContent} />}
    </section>
  );
}
