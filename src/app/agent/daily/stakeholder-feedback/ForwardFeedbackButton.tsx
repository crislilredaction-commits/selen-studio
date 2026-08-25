"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ForwardFeedbackButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function forward() {
    setPending(true);
    setError("");

    try {
      const response = await fetch("/agent/api/daily/stakeholder-feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "forward" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Impossible de transmettre la demande à l’organisme.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de transmettre la demande à l’organisme.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--selen-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={forward}
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
          {pending ? "Transmission…" : "Transmettre à l’organisme"}
        </button>
        <span style={{ fontSize: 11, color: "var(--selen-text2)" }}>
          Après cette action, la demande devient visible dans l’espace dirigeant de l’OF.
        </span>
      </div>
      {error ? <p style={{ color: "#a33a2b", fontSize: 12, marginBottom: 0 }}>{error}</p> : null}
    </div>
  );
}
