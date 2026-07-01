"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type NdaPhaseKey =
  | "initial_reception"
  | "program_analysis"
  | "signing_documents"
  | "final_return"
  | "ready_for_deposit";

type Props = {
  dossierId: string;
  phaseKey: NdaPhaseKey;
  isActive: boolean;
  isDone: boolean;
  warning?: string | null;
};

export default function NdaPhaseValidationActions({
  dossierId,
  phaseKey,
  isActive,
  isDone,
  warning,
}: Props) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<
    "validate" | "reopen" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  async function updatePhase(action: "validate" | "reopen") {
    if (action === "validate" && warning) {
      const confirmed = window.confirm(
        `${warning}\n\nVous pouvez tout de même valider la phase si vous avez vérifié le dossier.`,
      );

      if (!confirmed) return;
    }

    try {
      setPendingAction(action);
      setError(null);

      const response = await fetch("/agent/api/nda/validate-phase", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dossierId,
          phaseKey,
          action,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !data?.ok) {
        setError(
          data?.error ?? "Impossible de mettre à jour la validation de phase.",
        );
        return;
      }

      router.refresh();
      window.setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 80);
    } catch (phaseError) {
      console.error(phaseError);
      setError("Impossible de mettre à jour la validation de phase.");
    } finally {
      setPendingAction(null);
    }
  }

  if (!isActive && !isDone) return null;

  return (
    <div
      style={{
        borderTop: "1px solid var(--selen-border)",
        paddingTop: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {warning && isActive ? (
        <div
          style={{
            border: "1px solid rgba(212, 159, 63, 0.34)",
            background: "rgba(212, 159, 63, 0.08)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 10px",
            color: "var(--selen-text2)",
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          {warning} Vous pouvez tout de même valider la phase si vous avez
          vérifié le dossier.
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {isActive ? (
          <button
            type="button"
            onClick={() => void updatePhase("validate")}
            disabled={pendingAction !== null}
            style={{
              border: "1px solid var(--selen-border2)",
              borderRadius: "var(--radius-sm)",
              background: "var(--selen-gold2)",
              color: "#2d2116",
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: pendingAction ? "not-allowed" : "pointer",
              opacity: pendingAction ? 0.72 : 1,
            }}
          >
            {pendingAction === "validate"
              ? "Validation..."
              : "Valider cette phase et passer à la suivante"}
          </button>
        ) : null}

        {isDone ? (
          <button
            type="button"
            onClick={() => void updatePhase("reopen")}
            disabled={pendingAction !== null}
            style={{
              border: "1px solid var(--selen-border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--selen-card2)",
              color: "var(--selen-text2)",
              padding: "7px 10px",
              fontSize: 12,
              cursor: pendingAction ? "not-allowed" : "pointer",
              opacity: pendingAction ? 0.72 : 1,
            }}
          >
            {pendingAction === "reopen"
              ? "Réouverture..."
              : "Réouvrir cette phase"}
          </button>
        ) : null}
      </div>

      {error ? (
        <div
          style={{
            color: "var(--selen-danger)",
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
