"use client";

import { AlertTriangle, Check, Circle, History, LoaderCircle, RotateCcw, SkipForward, X } from "lucide-react";
import { useState } from "react";
import { checkpointLabels, checkpointStatusLabels } from "@/lib/forge/labels";
import type { MissionCheckpoint, MissionCheckpointStatus } from "@/lib/forge/types";

const statusIcons: Record<MissionCheckpointStatus, React.ReactNode> = {
  pending: <Circle size={16} />,
  in_progress: <LoaderCircle className="forge-spin" size={16} />,
  completed: <Check size={16} />,
  failed: <X size={16} />,
  skipped: <SkipForward size={16} />,
};

function formatDate(value?: string) {
  return value
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "—";
}

export default function MissionCheckpointPanel({
  checkpoints,
  busy,
  onUpdate,
}: {
  checkpoints: MissionCheckpoint[];
  busy: boolean;
  onUpdate: (checkpoint: MissionCheckpoint, status: MissionCheckpointStatus, message?: string) => Promise<void>;
}) {
  const [messages, setMessages] = useState<Record<string, string>>({});

  if (!checkpoints.length) {
    return (
      <section className="forge-detail__section">
        <h3>Checkpoints de mission</h3>
        <p className="forge-muted">Cette mission historique ne possède pas de checkpoints.</p>
      </section>
    );
  }

  const nextCheckpoint = checkpoints.find((checkpoint) => !["completed", "skipped"].includes(checkpoint.status));

  async function submit(checkpoint: MissionCheckpoint, status: MissionCheckpointStatus) {
    const message = messages[checkpoint.id]?.trim();
    if (status === "skipped" && !message) return;
    await onUpdate(checkpoint, status, message);
    setMessages((current) => ({ ...current, [checkpoint.id]: "" }));
  }

  return (
    <section className="forge-detail__section forge-checkpoints">
      <div className="forge-checkpoints__heading">
        <div>
          <h3>Checkpoints de mission</h3>
          <p>Reprise prévue : {nextCheckpoint ? checkpointLabels[nextCheckpoint.key] : "mission terminée"}</p>
        </div>
        <strong>{checkpoints.filter((checkpoint) => ["completed", "skipped"].includes(checkpoint.status)).length}/10</strong>
      </div>
      <ol>
        {checkpoints.map((checkpoint) => {
          const message = messages[checkpoint.id] ?? "";
          const actionable = checkpoint.id === nextCheckpoint?.id;
          const manuallyActionable = actionable && checkpoint.position < 3;
          return (
            <li key={checkpoint.id} className={`forge-checkpoint forge-checkpoint--${checkpoint.status}`}>
              <span className="forge-checkpoint__position">{checkpoint.position}</span>
              <div className="forge-checkpoint__body">
                <div className="forge-checkpoint__title">
                  <strong>{checkpointLabels[checkpoint.key]}</strong>
                  <span>{statusIcons[checkpoint.status]} {checkpointStatusLabels[checkpoint.status]}</span>
                </div>
                <div className="forge-checkpoint__dates">
                  <span>Début : {formatDate(checkpoint.startedAt)}</span>
                  <span>Fin : {formatDate(checkpoint.completedAt)}</span>
                </div>
                {checkpoint.message && (
                  <p className={checkpoint.status === "failed" ? "is-error" : ""}>
                    {checkpoint.status === "failed" && <AlertTriangle size={14} />} {checkpoint.message}
                  </p>
                )}
                {actionable && checkpoint.position >= 3 && (
                  <p className="forge-muted">
                    Ce checkpoint technique est piloté par le worker Cody et ne peut pas être avancé manuellement.
                  </p>
                )}
                {manuallyActionable && (
                  <div className="forge-checkpoint__editor">
                    <input
                      value={message}
                      onChange={(event) => setMessages((current) => ({ ...current, [checkpoint.id]: event.target.value }))}
                      placeholder="Résultat ou justification (obligatoire pour ignorer)"
                      disabled={busy}
                    />
                    <div>
                      {checkpoint.status === "pending" && (
                        <button className="forge-button forge-button--secondary" disabled={busy} onClick={() => void submit(checkpoint, "in_progress")}>
                          Commencer
                        </button>
                      )}
                      {checkpoint.status === "in_progress" && (
                        <>
                          <button className="forge-button forge-button--primary" disabled={busy} onClick={() => void submit(checkpoint, "completed")}>Terminer</button>
                          <button className="forge-button forge-button--secondary" disabled={busy} onClick={() => void submit(checkpoint, "failed")}>Signaler un échec</button>
                        </>
                      )}
                      {checkpoint.status === "failed" && (
                        <button className="forge-button forge-button--secondary" disabled={busy} onClick={() => void submit(checkpoint, "in_progress")}>
                          <RotateCcw size={14} /> Reprendre
                        </button>
                      )}
                      {["pending", "in_progress", "failed"].includes(checkpoint.status) && (
                        <button className="forge-button forge-button--secondary" disabled={busy || !message.trim()} onClick={() => void submit(checkpoint, "skipped")}>
                          Ignorer avec justification
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {checkpoint.history.length > 0 && (
                  <details className="forge-checkpoint__history">
                    <summary><History size={13} /> Historique ({checkpoint.history.length})</summary>
                    <ul>
                      {checkpoint.history.map((entry) => (
                        <li key={entry.id}>
                          <time>{formatDate(entry.createdAt)}</time>
                          <span>{entry.fromStatus ? `${checkpointStatusLabels[entry.fromStatus]} → ` : ""}{checkpointStatusLabels[entry.toStatus]}</span>
                          {entry.message && <p>{entry.message}</p>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
