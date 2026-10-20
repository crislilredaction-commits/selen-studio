"use client";

import { useEffect, useState } from "react";
import { Mail, X, Send, Paperclip, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { STUDIO_EMAIL_ATTACHMENT_BUCKET, validateStudioEmailAttachmentFiles } from "@/lib/studioEmailAttachments";

type Organisation = { id: string; name: string; email: string | null };

export default function StudioQuickEmail() {
  const [open, setOpen] = useState(false);
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [organisationId, setOrganisationId] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
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
      const validationError = validateStudioEmailAttachmentFiles(attachments);
      if (validationError) throw new Error(validationError);
      const uploaded = [];
      for (let index = 0; index < attachments.length; index += 1) {
        const file = attachments[index];
        setFeedback(`Téléversement de la pièce ${index + 1}/${attachments.length}…`);
        const ticketResponse = await fetch("/agent/api/quick-email/attachments", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organisationId, name: file.name, mimeType: file.type, sizeBytes: file.size }),
        });
        const ticket = await ticketResponse.json().catch(() => ({}));
        if (!ticketResponse.ok || !ticket.token) throw new Error(ticket.error || "Téléversement impossible.");
        const { error } = await createClient().storage.from(STUDIO_EMAIL_ATTACHMENT_BUCKET).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: ticket.mimeType, cacheControl: "0", upsert: false });
        if (error) throw new Error(`La pièce « ${file.name} » n’a pas pu être téléversée.`);
        uploaded.push({ path: ticket.path, name: ticket.name, mimeType: ticket.mimeType, sizeBytes: ticket.sizeBytes });
      }
      setFeedback(attachments.length ? "Envoi de l’email et des pièces jointes…" : "Envoi de l’email…");
      const response = await fetch("/agent/api/quick-email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisationId, to, subject, message, attachments: uploaded })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Envoi impossible");
      setSuccess(true); setFeedback("Email envoyé et enregistré dans l'historique.");
      setSubject(""); setMessage(""); setAttachments([]);
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
          <label><span style={{ display: "flex", gap: 7, alignItems: "center" }}><Paperclip size={16}/>Pièces jointes</span>
            <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.csv,.txt" disabled={busy} onChange={event => {
              const files = Array.from(event.target.files ?? []);
              const error = validateStudioEmailAttachmentFiles(files);
              if (error) { setSuccess(false); setFeedback(error); setAttachments([]); }
              else { setFeedback(""); setAttachments(files); }
              event.target.value = "";
            }} style={{ ...fieldStyle, padding: 8 }}/>
          </label>
          {attachments.length ? <div aria-label="Pièces jointes sélectionnées" style={{ display: "grid", gap: 7 }}>
            {attachments.map(file => <div key={`${file.name}-${file.size}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 10px", border: "1px solid #d7c3a4", borderRadius: 8, background: "#fff" }}>
              <span style={{ overflowWrap: "anywhere", fontSize: 13 }}>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} Mo</span>
              <button type="button" disabled={busy} aria-label={`Retirer ${file.name}`} onClick={() => setAttachments(current => current.filter(item => item !== file))} style={{ border: 0, background: "transparent", color: "#8c3028", cursor: "pointer" }}><Trash2 size={16}/></button>
            </div>)}
          </div> : null}
          <p style={{ fontSize: 12, margin: 0 }}>Jusqu’à 5 fichiers, 10 Mo chacun et 20 Mo au total : PDF, JPG/PNG, Word, Excel, CSV ou texte.</p>
          <p style={{ fontSize: 12, margin: 0 }}>Le message sera envoyé depuis Selen et conservé dans l’historique de l’organisme. Aucun email ne part avant ton clic sur Envoyer.</p>
          {feedback && <p role="status" style={{ margin: 0, color: success ? "#146b40" : "#a52c22" }}>{feedback}</p>}
          <button type="submit" disabled={busy} style={{ border: 0, borderRadius: 9, padding: 13, background: "#8d642b", color: "white", fontWeight: 700, cursor: busy ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Send size={17}/>{busy ? "Envoi en cours…" : "Envoyer l'email"}</button>
        </form>
      </section>
    </div>}
  </>;
}
const fieldStyle: React.CSSProperties = { display: "block", width: "100%", boxSizing: "border-box", padding: 10, marginTop: 5, borderRadius: 8, border: "1px solid #bda88e", background: "white", color: "#322518", font: "inherit" };
