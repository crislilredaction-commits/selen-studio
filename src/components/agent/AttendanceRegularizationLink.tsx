"use client";

import { useState } from "react";
import { buildAttendanceRegularizationEmail } from "@/lib/daily/attendanceRegularizationLink";

export default function AttendanceRegularizationLink({ url, expiresAt, learnerName, slotLabel }: { url: string | null; expiresAt?: string | null; learnerName: string; slotLabel: string }) {
  const [feedback, setFeedback] = useState("");
  const email = buildAttendanceRegularizationEmail({ learnerName, slotLabel, url, expiresAt });

  async function copy(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(success);
    } catch {
      setFeedback("Copie impossible. Réessaie ou copie le contenu manuellement.");
    }
  }

  if (!url) return <p style={{ margin: "5px 0 0", fontSize: 11, color: "var(--selen-text3)" }}>Accès apprenant inactif, expiré ou sans échéance : renouvelle d’abord son accès personnel.</p>;

  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 7 }}>
    <button type="button" onClick={() => void copy(url, "Lien copié. Vérifie le destinataire avant de l’envoyer.")} style={{ minHeight: 34 }}>Copier le lien personnel</button>
    {email ? <button type="button" onClick={() => void copy(email.clipboard, "Modèle d’email copié. Vérifie le destinataire et le contenu avant envoi.")} style={{ minHeight: 34 }}>Copier l’email de relance</button> : null}
    <a href={url} target="_blank" rel="noreferrer" style={{ color: "var(--selen-gold2)", fontSize: 12, fontWeight: 700 }}>Vérifier le lien</a>
    {expiresAt ? <span style={{ fontSize: 11, color: "var(--selen-text3)" }}>Expire le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(new Date(expiresAt))}</span> : null}
    <span style={{ flexBasis: "100%", fontSize: 11, color: "var(--selen-text3)" }}>Aucun email n’est envoyé automatiquement. Le destinataire doit être vérifié par un acteur habilité.</span>
    {feedback ? <span role="status" style={{ flexBasis: "100%", fontSize: 11, color: "var(--selen-text2)" }}>{feedback}</span> : null}
  </div>;
}
