"use client";

import { useState } from "react";

export default function AttendanceRegularizationLink({ url, expiresAt }: { url: string | null; expiresAt?: string | null }) {
  const [feedback, setFeedback] = useState("");

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setFeedback("Lien copié. Vérifie le destinataire avant de l’envoyer.");
    } catch {
      setFeedback("Copie impossible. Ouvre le lien puis copie son adresse.");
    }
  }

  if (!url) return <p style={{ margin: "5px 0 0", fontSize: 11, color: "var(--selen-text3)" }}>Accès apprenant inactif, expiré ou sans échéance : renouvelle d’abord son accès personnel.</p>;

  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 7 }}>
    <button type="button" onClick={() => void copy()} style={{ minHeight: 34 }}>Copier le lien personnel</button>
    <a href={url} target="_blank" rel="noreferrer" style={{ color: "var(--selen-gold2)", fontSize: 12, fontWeight: 700 }}>Vérifier le lien</a>
    {expiresAt ? <span style={{ fontSize: 11, color: "var(--selen-text3)" }}>Expire le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(new Date(expiresAt))}</span> : null}
    {feedback ? <span role="status" style={{ flexBasis: "100%", fontSize: 11, color: "var(--selen-text2)" }}>{feedback}</span> : null}
  </div>;
}
