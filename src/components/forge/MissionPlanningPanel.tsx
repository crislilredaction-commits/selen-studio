"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Download,
  History,
  Lightbulb,
  RefreshCw,
  Save,
  ShieldAlert,
  Undo2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { buildPlanningMarkdown } from "@/lib/forge/planning-markdown";
import type { Mission, MissionPlanDraft, PlanningRisk, PlanningStep } from "@/lib/forge/types";

function lines(values: string[]) {
  return values.join("\n");
}

function parseLines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function draftFromMission(mission: Mission): MissionPlanDraft | null {
  const plan = mission.currentPlan;
  if (!plan) return null;
  return {
    proposedTitle: plan.proposedTitle,
    summary: plan.summary,
    functionalObjective: plan.functionalObjective,
    includedScope: [...plan.includedScope],
    excludedScope: [...plan.excludedScope],
    constraints: [...plan.constraints],
    repositoryAreas: [...plan.repositoryAreas],
    technicalDependencies: [...plan.technicalDependencies],
    risks: plan.risks.map((risk) => ({ ...risk })),
    blockingQuestions: [...plan.blockingQuestions],
    nonBlockingQuestions: [...plan.nonBlockingQuestions],
    assumptions: [...plan.assumptions],
    recommendations: [...plan.recommendations],
    acceptanceCriteria: [...plan.acceptanceCriteria],
    executionSteps: plan.executionSteps.map((step) => ({ ...step })),
    verificationPlan: [...plan.verificationPlan],
    markdownContent: plan.markdownContent,
  };
}

export default function MissionPlanningPanel({
  mission,
  busy,
  onRegenerate,
  onSave,
  onValidate,
  onDraft,
}: {
  mission: Mission;
  busy: boolean;
  onRegenerate: () => Promise<void>;
  onSave: (plan: MissionPlanDraft) => Promise<void>;
  onValidate: () => Promise<void>;
  onDraft: (plan: MissionPlanDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<MissionPlanDraft | null>(() => draftFromMission(mission));
  const [copied, setCopied] = useState(false);

  const markdown = useMemo(() => {
    if (!draft) return "";
    return buildPlanningMarkdown({
      proposedTitle: draft.proposedTitle,
      summary: draft.summary,
      functionalObjective: draft.functionalObjective,
      includedScope: draft.includedScope,
      excludedScope: draft.excludedScope,
      constraints: draft.constraints,
      repositoryAreas: draft.repositoryAreas,
      technicalDependencies: draft.technicalDependencies,
      risks: draft.risks,
      blockingQuestions: draft.blockingQuestions,
      nonBlockingQuestions: draft.nonBlockingQuestions,
      assumptions: draft.assumptions,
      recommendations: draft.recommendations,
      acceptanceCriteria: draft.acceptanceCriteria,
      executionSteps: draft.executionSteps,
      verificationPlan: draft.verificationPlan,
    });
  }, [draft]);

  if (!draft || !mission.currentPlan) {
    return (
      <section className="forge-detail__section forge-planning-panel">
        <h3>Cadrage de la mission</h3>
        <p className="forge-muted">
          Le cadrage n’est pas encore disponible. Relancez l’analyse depuis la mission.
        </p>
        <button className="forge-button forge-button--primary" onClick={() => void onRegenerate()} disabled={busy}>
          <RefreshCw size={16} /> Générer le cadrage
        </button>
      </section>
    );
  }

  const current = mission.currentPlan;
  const setList = (key: keyof MissionPlanDraft, value: string) => {
    setDraft((previous) => previous ? { ...previous, [key]: parseLines(value) } : previous);
  };

  function setRisks(value: string) {
    const risks: PlanningRisk[] = parseLines(value).map((line) => {
      const [rawLevel, rawLabel, ...detail] = line.split("|").map((part) => part.trim());
      const level = ["low", "medium", "high", "critical"].includes(rawLevel)
        ? rawLevel as PlanningRisk["level"]
        : "medium";
      return { level, label: rawLabel || "Point de vigilance", detail: detail.join(" | ") };
    });
    setDraft((previous) => previous ? { ...previous, risks } : previous);
  }

  function setSteps(value: string) {
    const steps: PlanningStep[] = parseLines(value).map((line, index) => {
      const [title, ...detail] = line.split("|").map((part) => part.trim());
      return { position: index + 1, title: title || `Étape ${index + 1}`, detail: detail.join(" | ") };
    });
    setDraft((previous) => previous ? { ...previous, executionSteps: steps } : previous);
  }

  async function save() {
    if (!draft) return;
    await onSave({ ...draft, markdownContent: markdown });
  }

  async function reopen() {
    if (!draft) return;
    await onDraft({ ...draft, markdownContent: markdown });
  }

  async function copy() {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function download() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cadrage-cody-${mission.id}-v${current.version}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const field = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    rows = 4,
  ) => (
    <label>
      <span>{label}</span>
      <textarea value={value} rows={rows} onChange={(event) => onChange(event.target.value)} disabled={busy} />
    </label>
  );

  return (
    <section className="forge-detail__section forge-planning-panel">
      <div className="forge-planning-panel__header">
        <div>
          <p className="forge-eyebrow"><History size={14} /> Version {current.version}</p>
          <h3>Cadrage de la mission</h3>
        </div>
        <span className={`forge-badge forge-badge--${mission.status}`}>
          {current.status === "validated" ? "Validé" : current.status === "needs_clarification" ? "Précisions requises" : "À valider"}
        </span>
      </div>

      <div className="forge-planning-flags">
        <span><Lightbulb size={15} /> {draft.assumptions.length} hypothèse(s)</span>
        <span className={draft.blockingQuestions.length ? "is-danger" : ""}>
          <ShieldAlert size={15} /> {draft.blockingQuestions.length} blocage(s)
        </span>
        <span><AlertTriangle size={15} /> {draft.risks.length} risque(s)</span>
        <span><CheckCircle2 size={15} /> {draft.acceptanceCriteria.length} élément(s) à valider</span>
      </div>

      <details className="forge-planning-source">
        <summary>Demande source conservée</summary>
        <p>{mission.brief?.sourceRequest}</p>
        {mission.brief?.sourceContext && <p><strong>Contexte :</strong> {mission.brief.sourceContext}</p>}
        {mission.brief?.sourceConstraints && <p><strong>Contraintes :</strong> {mission.brief.sourceConstraints}</p>}
      </details>

      <div className="forge-planning-editor">
        {field("Titre proposé", draft.proposedTitle, (value) => setDraft({ ...draft, proposedTitle: value }), 2)}
        {field("Résumé", draft.summary, (value) => setDraft({ ...draft, summary: value }))}
        {field("Objectif fonctionnel", draft.functionalObjective, (value) => setDraft({ ...draft, functionalObjective: value }))}
        {field("Périmètre inclus — un élément par ligne", lines(draft.includedScope), (value) => setList("includedScope", value))}
        {field("Périmètre exclu — un élément par ligne", lines(draft.excludedScope), (value) => setList("excludedScope", value))}
        {field("Contraintes — une par ligne", lines(draft.constraints), (value) => setList("constraints", value))}
        {field("Zones du dépôt probables", lines(draft.repositoryAreas), (value) => setList("repositoryAreas", value))}
        {field("Dépendances techniques potentielles", lines(draft.technicalDependencies), (value) => setList("technicalDependencies", value))}
        {field("Risques — niveau | libellé | détail", draft.risks.map((risk) => `${risk.level} | ${risk.label} | ${risk.detail}`).join("\n"), setRisks)}
        {field("Questions bloquantes", lines(draft.blockingQuestions), (value) => setList("blockingQuestions", value))}
        {field("Questions non bloquantes", lines(draft.nonBlockingQuestions), (value) => setList("nonBlockingQuestions", value))}
        {field("Hypothèses raisonnables", lines(draft.assumptions), (value) => setList("assumptions", value))}
        {field("Recommandations facultatives", lines(draft.recommendations), (value) => setList("recommendations", value))}
        {field("Critères d’acceptation", lines(draft.acceptanceCriteria), (value) => setList("acceptanceCriteria", value))}
        {field("Plan ordonné — titre | détail", draft.executionSteps.map((step) => `${step.title} | ${step.detail}`).join("\n"), setSteps, 7)}
        {field("Vérifications prévues", lines(draft.verificationPlan), (value) => setList("verificationPlan", value))}
      </div>

      <details className="forge-planning-markdown">
        <summary>Prévisualiser le plan Markdown</summary>
        <pre>{markdown}</pre>
      </details>

      <div className="forge-planning-history">
        <strong>Historique</strong>
        {mission.planHistory.map((plan) => (
          <span key={plan.id}>
            v{plan.version} · {plan.status} · auteur {plan.createdBy?.slice(0, 8) ?? "inconnu"} · {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(plan.createdAt))}
          </span>
        ))}
      </div>

      <div className="forge-planning-actions">
        <button className="forge-button forge-button--secondary" onClick={() => void save()} disabled={busy}>
          <Save size={16} /> Enregistrer les modifications
        </button>
        <button className="forge-button forge-button--secondary" onClick={() => void onRegenerate()} disabled={busy}>
          <RefreshCw size={16} /> Régénérer
        </button>
        <button className="forge-button forge-button--primary" onClick={() => void onValidate()} disabled={busy || draft.blockingQuestions.length > 0 || current.status === "validated"}>
          <CheckCircle2 size={16} /> Valider le cadrage
        </button>
        <button className="forge-button forge-button--secondary" onClick={() => void reopen()} disabled={busy}>
          <Undo2 size={16} /> Revenir au brouillon
        </button>
        <button className="forge-button forge-button--secondary" onClick={() => void copy()} disabled={busy}>
          <Clipboard size={16} /> {copied ? "Plan copié" : "Copier le plan"}
        </button>
        <button className="forge-button forge-button--secondary" onClick={download} disabled={busy}>
          <Download size={16} /> Télécharger en Markdown
        </button>
      </div>

      {draft.blockingQuestions.length > 0 && (
        <p className="forge-planning-warning" role="alert">
          <ShieldAlert size={17} /> Résolvez ou requalifiez les questions bloquantes avant validation.
        </p>
      )}
      <p className="forge-muted">Aucune étape d’exécution n’est lancée depuis cet écran.</p>
    </section>
  );
}
