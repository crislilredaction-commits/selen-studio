"use client";

import { useState } from "react";
import { buildAttendanceRegularizationEmail } from "@/lib/daily/attendanceRegularizationLink";

export default function AttendanceRegularizationLink({ url, expiresAt, learnerName, learnerEmail, slotLabel, sessionId, enrolmentId, slotId }: { url: string | null; expiresAt?: string | null; learnerName: string; learnerEmail?: string | null; slotLabel: string; sessionId: string; enrolmentId: string; slotId: string }) {
  const [feedback, setFeedback] = useState("");
  const [recipientEmail, setRecipientEmail] = useState(learnerEmail ?? "");
  const [confirmedRecipient, setConfirmedRecipient] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [sending, setSending] = useState(false);
  const email = buildAttendanceRegularizationEmail({ learnerName, slotLabel, url, expiresAt });

  async function copy(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(success);
    } catch {
      setFeedback("Copie impossible. Réessaie ou copie le contenu manuellement.");
    }
  }

  async function simulateReminder() {
    setSimulating(true);
    setFeedback("");
    try {
      const response = await fetch("/agent/api/daily/attendance-regularization/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, enrolmentId, slotId, recipientEmail, confirmedRecipient }) });
      const result = await response.json() as { error?: string; deduplicated?: boolean };
      if (!response.ok) throw new Error(result.error || "Simulation impossible.");
      setFeedback(result.deduplicated ? "Cette simulation était déjà journalisée : aucun doublon créé et aucun email envoyé." : "Simulation journalisée. Aucun email n’a été envoyé.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Simulation impossible.");
    } finally {
      setSimulating(false);
    }
  }

  async function sendReminder() {
    if (!window.confirm(`Envoyer réellement cette relance à ${recipientEmail} ? Cette action sera historisée.`)) return;
    setSending(true);
    setFeedback("");
    try {
      const response = await fetch("/agent/api/daily/attendance-regularization/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, enrolmentId, slotId, recipientEmail, confirmedRecipient, confirmedSend: true }) });
      const result = await response.json() as { error?: string; deduplicated?: boolean };
      if (!response.ok) throw new Error(result.error || "Envoi impossible.");
      setFeedback(result.deduplicated ? "Cette relance avait déjà été envoyée pour ce cycle : aucun doublon créé." : "Relance envoyée et preuve d’envoi conservée.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Envoi impossible.");
    } finally {
      setSending(false);
    }
  }

  if (!url) return <p style={{ margin: "5px 0 0", fontSize: 11, color: "var(--selen-text3)" }}>Accès apprenant inactif, expiré ou sans échéance : renouvelle d’abord son accès personnel.</p>;

  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 7 }}>
    <button type="button" onClick={() => void copy(url, "Lien copié. Vérifie le destinataire avant de l’envoyer.")} style={{ minHeight: 34 }}>Copier le lien personnel</button>
    {email ? <button type="button" onClick={() => void copy(email.clipboard, "Modèle d’email copié. Vérifie le destinataire et le contenu avant envoi.")} style={{ minHeight: 34 }}>Copier l’email de relance</button> : null}
    <a href={url} target="_blank" rel="noreferrer" style={{ color: "var(--selen-gold2)", fontSize: 12, fontWeight: 700 }}>Vérifier le lien</a>
    {expiresAt ? <span style={{ fontSize: 11, color: "var(--selen-text3)" }}>Expire le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(new Date(expiresAt))}</span> : null}
    <span style={{ flexBasis: "100%", fontSize: 11, color: "var(--selen-text3)" }}>Aucun email n’est envoyé automatiquement. Le destinataire doit être vérifié par un acteur habilité ; l’envoi réel exige une seconde confirmation.</span>
    {learnerEmail ? <div style={{ flexBasis: "100%", display: "grid", gap: 7, padding: 9, border: "1px solid var(--selen-border)", borderRadius: 8 }}>
      <label style={{ display: "grid", gap: 4, fontSize: 11 }}>Destinataire à vérifier<input aria-label="Destinataire de la simulation" type="email" value={recipientEmail} onChange={(event) => { setRecipientEmail(event.target.value); setConfirmedRecipient(false); }} /></label>
      <label style={{ display: "flex", gap: 7, alignItems: "flex-start", fontSize: 11 }}><input type="checkbox" checked={confirmedRecipient} onChange={(event) => setConfirmedRecipient(event.target.checked)} />Je confirme que cette adresse est celle de l’apprenant concerné.</label>
      <button type="button" disabled={!confirmedRecipient || !recipientEmail.trim() || simulating} onClick={() => void simulateReminder()} style={{ minHeight: 34, justifySelf: "start" }}>{simulating ? "Simulation…" : "Simuler l’envoi (aucun email)"}</button>
      <button type="button" disabled={!confirmedRecipient || !recipientEmail.trim() || sending} onClick={() => void sendReminder()} style={{ minHeight: 34, justifySelf: "start" }}>{sending ? "Envoi…" : "Envoyer la relance"}</button>
    </div> : <span style={{ flexBasis: "100%", fontSize: 11, color: "#d36b5e" }}>Simulation indisponible : aucun email canonique n’est rattaché à l’apprenant.</span>}
    {feedback ? <span role="status" style={{ flexBasis: "100%", fontSize: 11, color: "var(--selen-text2)" }}>{feedback}</span> : null}
  </div>;
}
