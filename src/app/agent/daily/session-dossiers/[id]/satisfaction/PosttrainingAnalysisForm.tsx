"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

type Analysis = {
  strengths?: string | null;
  weaknesses?: string | null;
  vigilance?: string | null;
  summary?: string | null;
  action_required?: boolean | null;
};

export default function PosttrainingAnalysisForm({
  sessionId,
  enrolmentId,
  initial,
  enabled,
}: {
  sessionId: string;
  enrolmentId: string;
  initial?: Analysis | null;
  enabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || busy) return;
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/agent/api/daily/sessions/${sessionId}/posttraining-analysis`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enrolment_id: enrolmentId,
        strengths: form.get("strengths"),
        weaknesses: form.get("weaknesses"),
        vigilance: form.get("vigilance"),
        summary: form.get("summary"),
        action_required: form.get("action_required") === "on",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(payload.error ?? "Enregistrement impossible.");
      return;
    }
    setMessage("Analyse enregistrée dans la fiche de suivi.");
    router.refresh();
  }

  return <form onSubmit={submit} style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--selen-border)" }}>
    <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Analyse post-formation structurée</h3>
    {!enabled ? <p style={{ color: "var(--selen-text2)", fontSize: 13 }}>Disponible dès qu’une évaluation ou une satisfaction est enregistrée.</p> : null}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>Points forts
        <textarea name="strengths" rows={3} defaultValue={initial?.strengths ?? ""} disabled={!enabled || busy} maxLength={4000} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>Points faibles ou difficultés
        <textarea name="weaknesses" rows={3} defaultValue={initial?.weaknesses ?? ""} disabled={!enabled || busy} maxLength={4000} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>Vigilance ou action à suivre
        <textarea name="vigilance" rows={3} defaultValue={initial?.vigilance ?? ""} disabled={!enabled || busy} maxLength={4000} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>Synthèse libre
        <textarea name="summary" rows={3} defaultValue={initial?.summary ?? ""} disabled={!enabled || busy} maxLength={4000} />
      </label>
    </div>
    <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, fontWeight: 700 }}>
      <input type="checkbox" name="action_required" defaultChecked={Boolean(initial?.action_required)} disabled={!enabled || busy} />
      Une action humaine ou une vigilance reste nécessaire
    </label>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
      <button type="submit" disabled={!enabled || busy} style={{ minHeight: 38, padding: "0 12px", fontWeight: 800 }}>{busy ? "Enregistrement…" : "Enregistrer l’analyse"}</button>
      {message ? <span role="status" style={{ fontSize: 12, color: message.includes("impossible") ? "#a33" : "var(--selen-text2)" }}>{message}</span> : null}
    </div>
  </form>;
}
