"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ReviewStatus = "not_reviewed" | "validated" | "to_correct";

type Props = {
  documentId: string;
  currentStatus?: string | null;
};

const ACTIONS: Array<{
  status: ReviewStatus;
  label: string;
  pendingLabel: string;
  shortLabel: string;
  title: string;
}> = [
  {
    status: "validated",
    label: "Valider",
    pendingLabel: "Validation...",
    shortLabel: "✓",
    title: "Valider le document",
  },
  {
    status: "to_correct",
    label: "À corriger",
    pendingLabel: "Envoi...",
    shortLabel: "!",
    title: "Demander une correction",
  },
  {
    status: "not_reviewed",
    label: "Remettre à vérifier",
    pendingLabel: "Mise à jour...",
    shortLabel: "↻",
    title: "Remettre à vérifier",
  },
];

function getVisibleActions(currentStatus?: string | null) {
  if (currentStatus === "validated" || currentStatus === "to_correct") {
    return ACTIONS.filter((action) => action.status === "not_reviewed");
  }

  return ACTIONS.filter(
    (action) => action.status === "validated" || action.status === "to_correct",
  );
}

export default function DocumentReviewActions({
  documentId,
  currentStatus,
}: Props) {
  const router = useRouter();
  const [pendingStatus, setPendingStatus] = useState<ReviewStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateReviewStatus(reviewStatus: ReviewStatus) {
    const notes =
      reviewStatus === "to_correct"
        ? window.prompt("Note agent pour correction du document :", "")?.trim()
        : undefined;

    setError(null);
    setPendingStatus(reviewStatus);

    const response = await fetch("/agent/api/documents/review-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documentId,
        reviewStatus,
        ...(notes !== undefined ? { notes } : {}),
      }),
    });

    setPendingStatus(null);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "Impossible de mettre à jour le document.");
      return;
    }

    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {getVisibleActions(currentStatus).map((action) => {
          const pending = pendingStatus === action.status;
          const disabled = Boolean(pendingStatus) || currentStatus === action.status;
          const isPrimary = action.status === "validated";

          return (
            <button
              key={action.status}
              type="button"
              disabled={disabled}
              onClick={() => updateReviewStatus(action.status)}
              title={action.title}
              aria-label={action.title}
              style={{
                border: "1px solid var(--selen-border)",
                borderRadius: 6,
                background:
                  isPrimary
                    ? "var(--selen-gold)"
                    : action.status === "to_correct"
                      ? "var(--selen-danger-bg)"
                      : "var(--selen-bg3)",
                color:
                  isPrimary
                    ? "var(--selen-ink)"
                    : action.status === "to_correct"
                      ? "var(--selen-danger)"
                      : "var(--selen-text2)",
                cursor: disabled ? "default" : "pointer",
                fontFamily: "var(--font-body)",
                fontSize: pending ? 10 : 14,
                fontWeight: 700,
                opacity: disabled ? 0.58 : 1,
                width: pending ? "auto" : 32,
                height: 32,
                padding: pending ? "0 8px" : 0,
                whiteSpace: "nowrap",
              }}
            >
              {pending ? action.pendingLabel : action.shortLabel}
            </button>
          );
        })}
      </div>
      {error ? (
        <div style={{ color: "var(--selen-danger)", fontSize: 11 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
