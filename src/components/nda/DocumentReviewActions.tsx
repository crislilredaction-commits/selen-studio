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
}> = [
  {
    status: "validated",
    label: "Valider",
    pendingLabel: "Validation...",
  },
  {
    status: "to_correct",
    label: "À corriger",
    pendingLabel: "Envoi...",
  },
  {
    status: "not_reviewed",
    label: "Remettre à vérifier",
    pendingLabel: "Mise à jour...",
  },
];

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
        {ACTIONS.map((action) => {
          const pending = pendingStatus === action.status;
          const disabled = Boolean(pendingStatus) || currentStatus === action.status;

          return (
            <button
              key={action.status}
              type="button"
              disabled={disabled}
              onClick={() => updateReviewStatus(action.status)}
              style={{
                border: "1px solid var(--selen-border)",
                borderRadius: 6,
                background:
                  action.status === "validated"
                    ? "var(--selen-gold)"
                    : "var(--selen-bg3)",
                color:
                  action.status === "validated"
                    ? "#0f0c08"
                    : "var(--selen-text)",
                cursor: disabled ? "default" : "pointer",
                fontFamily: "var(--font-body)",
                fontSize: 11,
                fontWeight: 600,
                opacity: disabled ? 0.58 : 1,
                padding: "5px 7px",
                whiteSpace: "nowrap",
              }}
            >
              {pending ? action.pendingLabel : action.label}
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
