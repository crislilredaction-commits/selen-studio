"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ReviewFeedbackForm({ id }: { id: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submitReview() {
    setPending(true);
    setError("");

    try {
      const response = await fetch("/agent/api/daily/stakeholder-feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "review", note }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Impossible d’enregistrer la revue Selen.");
      setNote("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible d’enregistrer la revue Selen.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--selen-border)" }}>
      <label htmlFor={`selen-review-${id}`} style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
        Note de revue Selen <span style={{ fontWeight: 400, color: "var(--selen-text2)" }}>(facultative)</span>
      </label>
      <textarea
        id={`selen-review-${id}`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        maxLength={4000}
        disabled={pending}
        placeholder="Points vérifiés, contexte utile ou consigne avant transmission à l’organisme…"
        style={{
          width: "100%",
          boxSizing: "border-box",
          border: "1px solid var(--selen-border)",
          borderRadius: 10,
          padding: 10,
          background: "var(--selen-bg2)",
          color: "inherit",
          resize: "vertical",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={submitReview}
          disabled={pending}
          style={{
            border: "1px solid var(--selen-border)",
            borderRadius: 999,
            padding: "8px 12px",
            background: "var(--selen-bg2)",
            color: "inherit",
            fontWeight: 700,
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending ? "Enregistrement…" : "Marquer comme revue par Selen"}
        </button>
        <span style={{ fontSize: 11, color: "var(--selen-text2)" }}>
          Cette action ne transmet pas encore la demande à l’OF.
        </span>
      </div>
      {error ? <p style={{ color: "#a33a2b", fontSize: 12, marginBottom: 0 }}>{error}</p> : null}
    </div>
  );
}
