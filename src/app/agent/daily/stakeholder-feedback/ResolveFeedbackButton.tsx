"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ResolveFeedbackButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function resolve() {
    setPending(true);
    setError("");

    try {
      const response = await fetch("/agent/api/daily/stakeholder-feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "resolve" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Impossible de clôturer la demande.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de clôturer la demande.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--selen-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={resolve}
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
          {pending ? "Clôture…" : "Clôturer après réponse de l’OF"}
        </button>
        <span style={{ fontSize: 11, color: "var(--selen-text2)" }}>
          La clôture reste contrôlée par Selen et nécessite une réponse de l’organisme.
        </span>
      </div>
      {error ? <p style={{ color: "#a33a2b", fontSize: 12, marginBottom: 0 }}>{error}</p> : null}
    </div>
  );
}
