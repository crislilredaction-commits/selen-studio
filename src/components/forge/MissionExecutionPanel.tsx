"use client";

import { GitBranch, LoaderCircle, Play, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Mission } from "@/lib/forge/types";

export default function MissionExecutionPanel({
  mission,
  busy,
  onRequest,
}: {
  mission: Mission;
  busy: boolean;
  onRequest: (targetBranch: string) => Promise<void>;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [branch, setBranch] = useState(`test/cody-${mission.id.slice(0, 8)}`);
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
    && !latest,
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
      {!latest && (
        <div className="forge-checkpoint__editor">
          <input value={branch} onChange={(event) => setBranch(event.target.value.toLowerCase())}
            aria-label="Branche cible" disabled={busy || !configured} />
          <button className="forge-button forge-button--primary" type="button"
            disabled={busy || !configured || !executable}
            onClick={() => void onRequest(branch)}>
            {busy ? <LoaderCircle className="forge-spin" size={15} /> : <Play size={15} />}
            Lancer l’exécution
          </button>
          {!executable && <small>Le plan courant doit être validé et sans blocage.</small>}
        </div>
      )}
    </section>
  );
}
