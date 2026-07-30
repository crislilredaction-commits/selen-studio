"use client";

import { Archive, Ban, MessageSquareText, ShieldAlert } from "lucide-react";
import { useState } from "react";
import type { ForgeAccessLevel, Mission } from "@/lib/forge/types";

type ControlAction = "maintain_block" | "abandon" | "archive";

const actionCopy: Record<ControlAction, { label: string; consequence: string; confirmation: string }> = {
  maintain_block: {
    label: "Maintenir le blocage",
    consequence: "Cody restera arrêté au checkpoint actuel jusqu’à une nouvelle décision.",
    confirmation: "MAINTENIR",
  },
  abandon: {
    label: "Abandonner la mission",
    consequence: "L’exécution s’arrêtera définitivement. L’historique restera consultable.",
    confirmation: "ABANDONNER",
  },
  archive: {
    label: "Archiver la mission",
    consequence: "La mission quittera les vues actives mais son historique sera conservé.",
    confirmation: "ARCHIVER",
  },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function MissionHumanControlPanel({
  mission,
  accessLevel,
  busy,
  onInstruction,
  onControl,
}: {
  mission: Mission;
  accessLevel: ForgeAccessLevel;
  busy: boolean;
  onInstruction: (content: string, sensitivity: "minor" | "sensitive") => Promise<void>;
  onControl: (action: ControlAction, reason: string, consequences: string) => Promise<void>;
}) {
  const [instruction, setInstruction] = useState("");
  const [sensitivity, setSensitivity] = useState<"minor" | "sensitive">("minor");
  const [pendingAction, setPendingAction] = useState<ControlAction | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const canAdminister = accessLevel === "admin";

  async function submitInstruction() {
    if (instruction.trim().length < 3) return;
    await onInstruction(instruction.trim(), sensitivity);
    setInstruction("");
    setSensitivity("minor");
  }

  async function confirmAction() {
    if (!pendingAction) return;
    const copy = actionCopy[pendingAction];
    if (confirmation !== copy.confirmation || reason.trim().length < 3) return;
    await onControl(pendingAction, reason.trim(), copy.consequence);
    setPendingAction(null);
    setReason("");
    setConfirmation("");
  }

  const canArchive = ["validated", "failed", "abandoned"].includes(mission.status);
  const canAbandon = !["validated", "abandoned", "archived"].includes(mission.status);

  return (
    <section className="forge-detail__section forge-human-control" aria-labelledby="human-control-title">
      <div className="forge-section-heading">
        <div>
          <p className="forge-eyebrow">Pilotage humain</p>
          <h3 id="human-control-title">Décisions et consignes</h3>
        </div>
        <span className={`forge-access-badge forge-access-badge--${accessLevel}`}>
          {accessLevel === "admin" ? "Administration complète" : "Consultation"}
        </span>
      </div>

      <div className="forge-instruction-form">
        <label htmlFor={`forge-instruction-${mission.id}`}>Écrire une consigne à Cody</label>
        <textarea
          id={`forge-instruction-${mission.id}`}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          disabled={!canAdminister || busy}
          placeholder="Décrivez clairement la décision ou la modification demandée."
          rows={4}
        />
        <fieldset disabled={!canAdminister || busy}>
          <legend>Effet de la consigne</legend>
          <label>
            <input type="radio" checked={sensitivity === "minor"} onChange={() => setSensitivity("minor")} />
            Ajustement mineur dans le plan validé
          </label>
          <label>
            <input type="radio" checked={sensitivity === "sensitive"} onChange={() => setSensitivity("sensitive")} />
            Modification sensible : bloque Cody et exige un nouveau plan validé
          </label>
        </fieldset>
        <button
          className="forge-button forge-button--primary"
          type="button"
          disabled={!canAdminister || busy || instruction.trim().length < 3}
          onClick={() => void submitInstruction()}
        >
          <MessageSquareText size={16} /> Envoyer la consigne
        </button>
        {!canAdminister ? <p className="forge-muted">Votre accès permet la consultation, pas les décisions.</p> : null}
      </div>

      <details className="forge-human-history">
        <summary>Historique humain ({mission.instructions.length + mission.decisions.length})</summary>
        {mission.instructions.length === 0 && mission.decisions.length === 0 ? (
          <p className="forge-muted">Aucune consigne ou décision enregistrée.</p>
        ) : (
          <ol>
            {[
              ...mission.instructions.map((item) => ({
                id: item.id,
                date: item.createdAt,
                title: item.sensitivity === "sensitive" ? "Consigne sensible" : "Consigne mineure",
                text: item.content,
              })),
              ...mission.decisions.map((item) => ({
                id: item.id,
                date: item.decidedAt,
                title: item.action.replaceAll("_", " "),
                text: `${item.reason} — ${item.consequences}`,
              })),
            ].toSorted((left, right) => right.date.localeCompare(left.date)).map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
                <time dateTime={item.date}>{formatDate(item.date)}</time>
              </li>
            ))}
          </ol>
        )}
      </details>

      {canAdminister ? (
        <div className="forge-sensitive-actions">
          {mission.status === "blocked" ? (
            <button className="forge-button forge-button--secondary" type="button" onClick={() => setPendingAction("maintain_block")}>
              <ShieldAlert size={16} /> Maintenir le blocage
            </button>
          ) : null}
          {canAbandon ? (
            <button className="forge-button forge-button--danger" type="button" onClick={() => setPendingAction("abandon")}>
              <Ban size={16} /> Abandonner
            </button>
          ) : null}
          {canArchive ? (
            <button className="forge-button forge-button--secondary" type="button" onClick={() => setPendingAction("archive")}>
              <Archive size={16} /> Archiver
            </button>
          ) : null}
        </div>
      ) : null}

      {pendingAction ? (
        <div className="forge-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="forge-confirmation-title">
          <h4 id="forge-confirmation-title">{actionCopy[pendingAction].label}</h4>
          <p>{actionCopy[pendingAction].consequence}</p>
          <label>
            Motif obligatoire
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} autoFocus />
          </label>
          <label>
            Saisissez <strong>{actionCopy[pendingAction].confirmation}</strong> pour confirmer
            <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          </label>
          <div>
            <button className="forge-button forge-button--secondary" type="button" onClick={() => setPendingAction(null)}>Annuler</button>
            <button
              className="forge-button forge-button--danger"
              type="button"
              disabled={busy || reason.trim().length < 3 || confirmation !== actionCopy[pendingAction].confirmation}
              onClick={() => void confirmAction()}
            >
              Confirmer l’action
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
