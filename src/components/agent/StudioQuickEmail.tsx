"use client";

import { useEffect, useState } from "react";
import { Mail, X, Send } from "lucide-react";

type Organisation = { id: string; name: string; email: string | null };

export default function StudioQuickEmail() {
  const [open, setOpen] = useState(false);
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [organisationId, setOrganisationId] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    if (!open || organisations.length) return;
    let active = true;
    fetch("/agent/api/quick-email").then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Chargement impossible");
      if (active) setOrganisations(result.organisations || []);
    }).catch(error => { if (active) setFeedback(error.message); });
    return () => { active = false; };
  }, [open, organisations.length]);
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setFeedback(""); setSuccess(false);
    try {
      const response = await fetch("/agent/api/quick-email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisationId, to, subject, message })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Envoi impossible");
      setSuccess(true); setFeedback("Email envoyé et enregistré dans l'historique.");
      setSubject(""); setMessage("");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Erreur d'envoi"); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="Rédiger un email" title="Envoyer un email"
      style={{ position: "fixed", right: 20, bottom: 22, zIndex: 1000, borderRadius: 999, border: "1px solid #b58a45", background: "#3c2b1b", color: "#fff2d8", padding: "13px 17px", boxShadow: "0 6px 24px #0005", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
      <Mail size={20} /> <span>Email</span>
    </button>
    {open && <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setOpen(false); }}
      style={{ position: "fixed", inset: 0, zIndex: 1100, background: "#0009", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <section role="dialog" aria-modal="true" aria-label="Nouvel email" style={{ background: "#fffaf1", color: "#322518", width: "min(100%, 540px)", maxHeight: "92vh", overflowY: "auto", borderRadius: 16, padding: 22, boxShadow: "0 16px 50px #0006" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 21 }}>Nouvel email</h2>
          <button type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="Fermer" style={{ background: "transparent", border: 0, cursor: "pointer", color: "inherit" }}><X size={23}/></button>
        </div>
        <form onSubmit={send} style={{ display: "grid", gap: 12 }}>
          <label>Organisme concerné
            <select required value={organisationId} onChange={event => { const id = event.target.value; setOrganisationId(id); const org = organisations.find(item => item.id === id); if (org?.email) setTo(org.email); }}
              style={fieldStyle}><option value="">Choisir un organisme</option>{organisations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select>
          </label>
          <label>Destinataire (organisme, apprenant, entreprise ou formateur)
            <input required type="email" value={to} onChange={event => setTo(event.target.value)} placeholder="adresse@exemple.fr" style={fieldStyle}/>
          </label>
          <label>Objet<input required maxLength={200} value={subject} onChange={event => setSubject(event.target.value)} style={fieldStyle}/></label>
          <label>Message<textarea required maxLength={20000} rows={8} value={message} onChange={event => setMessage(event.target.value)} style={{ ...fieldStyle, resize: "vertical" }}/></label>
          <p style={{ fontSize: 12, margin: 0 }}>Le message sera envoyé depuis Selen et conservé dans l'historique de l'organisme. Aucun email ne part avant ton clic sur Envoyer.</p>
          {feedback && <p role="status" style={{ margin: 0, color: success ? "#146b40" : "#a52c22" }}>{feedback}</p>}
          <button type="submit" disabled={busy} style={{ border: 0, borderRadius: 9, padding: 13, background: "#8d642b", color: "white", fontWeight: 700, cursor: busy ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Send size={17}/>{busy ? "Envoi en cours…" : "Envoyer l'email"}</button>
        </form>
      </section>
    </div>}
  </>;
}
const fieldStyle: React.CSSProperties = { display: "block", width: "100%", boxSizing: "border-box", padding: 10, marginTop: 5, borderRadius: 8, border: "1px solid #bda88e", background: "white", color: "#322518", font: "inherit" };
