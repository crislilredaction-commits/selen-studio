"use client";

import { AlertTriangle, Ban, CheckCircle2, History, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { checkpointLabels } from "@/lib/forge/labels";
import type { MissionCheckpoint, MissionIncident } from "@/lib/forge/types";

const categoryLabels = {
  warning: "Avertissement",
  recoverable_error: "Erreur récupérable",
  critical_error: "Erreur critique",
  human_decision_required: "Décision humaine requise",
} as const;

const statusLabels = {
  detected: "Détecté",
  retrying: "Nouvelle tentative",
  resolved: "Résolu",
  blocked: "Bloqué",
  failed: "Échec définitif",
  ignored_with_justification: "Ignoré avec justification",
} as const;

function formatDate(value?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function MissionIncidentPanel({
  incidents,
  checkpoints,
  busy,
  onResolve,
  onResume,
  missionBlocked,
}: {
  incidents: MissionIncident[];
  checkpoints: MissionCheckpoint[];
  busy: boolean;
  onResolve: (
    incident: MissionIncident,
    status: "resolved" | "ignored_with_justification",
    message: string,
  ) => Promise<void>;
  onResume: () => Promise<void>;
  missionBlocked: boolean;
}) {
  const [messages, setMessages] = useState<Record<string, string>>({});
  const checkpointById = new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  const openCount = incidents.filter((incident) =>
    !["resolved", "ignored_with_justification"].includes(incident.resolutionStatus)
  ).length;

  async function submit(
    incident: MissionIncident,
    status: "resolved" | "ignored_with_justification",
  ) {
    const message = messages[incident.id]?.trim() ?? "";
    if (!message) return;
    await onResolve(incident, status, message);
    setMessages((current) => ({ ...current, [incident.id]: "" }));
  }

  return (
    <section className="forge-detail__section forge-incidents">
      <div className="forge-incidents__heading">
        <div>
          <h3>Incidents de mission</h3>
          <p>Historique conservé, avec trois tentatives automatiques au maximum.</p>
        </div>
        <strong>{openCount} ouvert{openCount > 1 ? "s" : ""}</strong>
      </div>

      {incidents.length === 0 ? (
        <p className="forge-muted">Aucun incident enregistré.</p>
      ) : (
        <ol>
          {incidents.map((incident) => {
            const checkpoint = checkpointById.get(incident.checkpointId);
            const closed = ["resolved", "ignored_with_justification"].includes(
              incident.resolutionStatus,
            );
            const message = messages[incident.id] ?? "";
            return (
              <li
                key={incident.id}
                className={`forge-incident forge-incident--${incident.category} forge-incident--${incident.resolutionStatus}`}
              >
                <div className="forge-incident__title">
                  <span>
                    {incident.category === "warning" ? <AlertTriangle size={16} /> : null}
                    {incident.category === "recoverable_error" ? <History size={16} /> : null}
                    {incident.category === "critical_error" ? <ShieldAlert size={16} /> : null}
                    {incident.category === "human_decision_required" ? <Ban size={16} /> : null}
                    {categoryLabels[incident.category]}
                  </span>
                  <code>{incident.code}</code>
                </div>
                <p className="forge-incident__message">{incident.message}</p>
                <dl>
                  <div><dt>Checkpoint</dt><dd>{checkpoint ? checkpointLabels[checkpoint.key] : "Inconnu"}</dd></div>
                  <div><dt>Statut</dt><dd>{statusLabels[incident.resolutionStatus]}</dd></div>
                  <div><dt>Tentatives</dt><dd>{incident.attemptCount}/{incident.maxAttempts}</dd></div>
                  <div><dt>Détection</dt><dd>{formatDate(incident.detectedAt)}</dd></div>
                  <div><dt>Résolution</dt><dd>{formatDate(incident.resolvedAt)}</dd></div>
                  <div><dt>Stratégie</dt><dd>{incident.correctionStrategy ?? "—"}</dd></div>
                </dl>
                {incident.humanDecisionRequired ? (
                  <p className="forge-incident__decision">
                    <ShieldAlert size={14} /> Décision attendue : {incident.humanDecisionRequired}
                  </p>
                ) : null}
                {incident.ignoreJustification ? (
                  <p>Justification : {incident.ignoreJustification}</p>
                ) : null}
                {incident.attempts.length > 0 ? (
                  <details>
                    <summary>Corrections tentées ({incident.attempts.length})</summary>
                    <ol>
                      {incident.attempts.map((attempt) => (
                        <li key={attempt.id}>
                          <strong>#{attempt.attemptNumber} · {attempt.strategy}</strong>
                          <span>{attempt.resultStatus} — {attempt.resultMessage}</span>
                          <time dateTime={attempt.completedAt}>{formatDate(attempt.completedAt)}</time>
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
                {!closed ? (
                  <div className="forge-incident__actions">
                    <input
                      aria-label={`Résolution de ${incident.code}`}
                      value={message}
                      onChange={(event) => setMessages((current) => ({
                        ...current,
                        [incident.id]: event.target.value,
                      }))}
                      placeholder="Résultat ou justification obligatoire"
                    />
                    <button
                      className="forge-button forge-button--primary"
                      disabled={busy || !message}
                      onClick={() => void submit(incident, "resolved")}
                    >
                      <CheckCircle2 size={15} /> Marquer résolu
                    </button>
                    {incident.category !== "critical_error" ? (
                      <button
                        className="forge-button forge-button--secondary"
                        disabled={busy || !message}
                        onClick={() => void submit(incident, "ignored_with_justification")}
                      >
                        Ignorer avec justification
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      {missionBlocked && openCount === 0 ? (
        <button
          className="forge-button forge-button--primary forge-incidents__resume"
          type="button"
          disabled={busy}
          onClick={() => void onResume()}
        >
          Reprendre au checkpoint concerné
        </button>
      ) : null}
    </section>
  );
}
