"use client";

import { GitBranch, LoaderCircle, Play, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ControlledEditInstruction, Mission } from "@/lib/forge/types";

const firstControlledContent = `# Premier test d’édition contrôlée de Cody

Ce fichier a été créé automatiquement par le moteur d’exécution Cody.

Aucun fichier métier n’a été modifié.
`;

export default function MissionExecutionPanel({
  mission,
  busy,
  onRequest,
}: {
  mission: Mission;
  busy: boolean;
  onRequest: (targetBranch: string, instruction: ControlledEditInstruction) => Promise<void>;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [branch, setBranch] = useState(`test/cody-edit-${mission.id.slice(0, 8)}`);
  const [targetPath, setTargetPath] = useState(
    "docs/forge-cody-sandbox/first-controlled-edit.md",
  );
  const [content, setContent] = useState(firstControlledContent);
  const [commitMessage, setCommitMessage] = useState(
    "docs(forge): add first controlled Cody edit",
  );
  const latest = mission.executionRuns[0];
  const executable = useMemo(() => Boolean(
    mission.currentPlan?.isCurrent
    && mission.currentPlan.status === "validated"
    && mission.planningValidatedAt
    && mission.currentPlan.blockingQuestions.length === 0
    && !mission.archivedAt
    && !mission.incidents.some((incident) =>
      incident.category === "critical_error"
      && !["resolved", "ignored_with_justification"].includes(incident.resolutionStatus)
    )
    && (!latest || latest.status === "queued"),
  ), [latest, mission]);

  useEffect(() => {
    void fetch("/agent/api/forge/executions")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => setConfigured(Boolean(payload.configured)))
      .catch(() => setConfigured(false));
  }, []);

  return (
    <section className="forge-detail__section">
      <h3>Moteur d’exécution Cody</h3>
      <p className={configured ? "forge-muted" : "is-error"}>
        {configured === null
          ? "Vérification du worker…"
          : configured
            ? latest?.status === "queued"
              ? "En attente du worker Cody."
              : "Worker Cody connecté."
            : "Moteur d’exécution non connecté."}
      </p>
      {latest && (
        <div className="forge-execution-status">
          <p><strong>État :</strong> {latest.status}</p>
          <p><strong>Tentative :</strong> {latest.attemptCount}/3</p>
          <p><GitBranch size={14} /> {latest.targetBranch}</p>
          {latest.gitCommitSha && <code>{latest.gitCommitSha}</code>}
          {latest.lastError && <p className="is-error"><ShieldAlert size={14} /> {latest.lastError}</p>}
        </div>
      )}
      {(!latest || latest.status === "queued") && (
        <div className="forge-checkpoint__editor">
          <input value={branch} onChange={(event) => setBranch(event.target.value.toLowerCase())}
            aria-label="Branche cible" disabled={busy || !configured} />
          <input value={targetPath} onChange={(event) => setTargetPath(event.target.value)}
            aria-label="Fichier sandbox cible" disabled={busy || !configured} />
          <textarea value={content} onChange={(event) => setContent(event.target.value)}
            aria-label="Contenu attendu" rows={7} disabled={busy || !configured} />
          <input value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)}
            aria-label="Message du commit" disabled={busy || !configured} />
          <small>Commande autorisée : <code>git_status_short</code>. Écriture limitée à <code>docs/forge-cody-sandbox/</code>.</small>
          <button className="forge-button forge-button--primary" type="button"
            disabled={busy || !configured || !executable}
            onClick={() => void onRequest(branch, {
              target_path: targetPath,
              operation: "create",
              expected_content: content,
              allowed_command: "git_status_short",
              commit_message: commitMessage,
            })}>
            {busy ? <LoaderCircle className="forge-spin" size={15} /> : <Play size={15} />}
            {latest?.status === "queued" ? "Démarrer le worker" : "Lancer l’exécution"}
          </button>
          {!executable && <small>Le plan courant doit être validé et sans blocage.</small>}
        </div>
      )}
    </section>
  );
}
