"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; label: string };
type Props = {
  organisationId: string;
  trainers: Option[];
  learners: Option[];
  formations: Option[];
  sessions: Option[];
  enrolments: Option[];
  documents: DelegatedDocument[];
};
type DelegatedDocument = {
  id: string; logical_name: string; version: number; status: string; is_current: boolean;
  created_at: string; updated_at: string; metadata: Record<string, unknown> | null;
};
type Feedback = { kind: "success" | "error"; text: string } | null;

export default function DelegatedDocumentUpload({ organisationId, trainers, learners, formations, sessions, enrolments, documents }: Props) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setFeedback(null);
    const form = new FormData(formElement);
    form.set("organisation_id", organisationId);
    const links = ["trainer", "learner", "formation", "session", "enrolment"]
      .map((type) => [type, String(form.get(`${type}_id`) ?? "").trim()] as const)
      .filter(([, id]) => id)
      .map(([type, id]) => `${type}:${id}`);
    form.delete("trainer_id"); form.delete("learner_id"); form.delete("formation_id"); form.delete("session_id"); form.delete("enrolment_id");
    form.append("link", `organisation:${organisationId}`);
    links.forEach((link) => form.append("link", link));
    try {
      const response = await fetch("/agent/api/daily/delegated-documents", { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setFeedback({ kind: "error", text: result.error || "Import impossible." }); return; }
      setFeedback({ kind: "success", text: `Document importé et rattaché (${result.links} rattachement(s)).` });
      formElement.reset();
      router.refresh();
    } catch {
      setFeedback({ kind: "error", text: "Le serveur n’est pas joignable. Réessaie sans fermer cette page." });
    } finally {
      setBusy(false);
    }
  }

  async function replaceDocument(document: DelegatedDocument, file: File) {
    setBusy(true);
    setFeedback(null);
    const form = new FormData();
    form.set("organisation_id", organisationId);
    form.set("logical_name", document.logical_name);
    form.set("replace_document_id", document.id);
    form.set("expected_updated_at", document.updated_at);
    form.set("file", file);
    try {
      const response = await fetch("/agent/api/daily/delegated-documents", { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setFeedback({ kind: "error", text: result.error || "Remplacement impossible." }); return; }
      setFeedback({ kind: "success", text: `Nouvelle version importée. La version ${document.version} reste dans l’historique.` });
      router.refresh();
    } catch {
      setFeedback({ kind: "error", text: "Le serveur n’est pas joignable. Réessaie sans fermer cette page." });
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} style={{display:"grid",gap:14,maxWidth:760}}>
    <label>Nom du document<input name="logical_name" required style={input}/></label>
    <label>Fichier<input name="file" type="file" accept=".pdf,.doc,.docx,.odt,.xls,.xlsx,.jpg,.jpeg,.png" required style={input}/></label>
    <p style={{margin:0,fontSize:13,color:"var(--selen-text2)"}}>PDF, Word, OpenDocument, Excel ou image JPG/PNG · 25 Mo maximum.</p>
    <p style={{margin:0,fontSize:13,color:"var(--selen-text2)"}}>Le document est toujours rattaché à l’organisme. Sélectionne seulement les rattachements complémentaires utiles. Aucun identifiant technique n’est à recopier.</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}>
      <EntitySelect name="trainer_id" label="Formateur" options={trainers}/>
      <EntitySelect name="learner_id" label="Apprenant" options={learners}/>
      <EntitySelect name="formation_id" label="Formation" options={formations}/>
      <EntitySelect name="session_id" label="Session" options={sessions}/>
      <EntitySelect name="enrolment_id" label="Inscription" options={enrolments}/>
    </div>
    <button type="submit" disabled={busy} style={{padding:"10px 14px",borderRadius:10,border:0,cursor:"pointer",fontWeight:700}}>{busy ? "Import en cours…" : "Importer pour le compte du client"}</button>
    {feedback ? <p role={feedback.kind === "error" ? "alert" : "status"} style={{margin:0,fontSize:14,color:feedback.kind === "error" ? "var(--selen-danger, #a62323)" : "var(--selen-success, #287a45)"}}>{feedback.text}</p> : null}
    <section aria-label="Documents importés en délégation" style={{display:"grid",gap:10,marginTop:10}}>
      <h2 style={{fontSize:18,margin:"8px 0 0"}}>Documents déjà importés</h2>
      {documents.length === 0 ? <p style={{margin:0,fontSize:13,color:"var(--selen-text2)"}}>Aucun import en délégation enregistré pour cet organisme.</p> : documents.map((document) => {
        const originalName = typeof document.metadata?.original_filename === "string" ? document.metadata.original_filename : document.logical_name;
        return <article key={document.id} style={{border:"1px solid var(--selen-border)",borderRadius:10,padding:12,opacity:document.is_current ? 1 : .72}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            <div><strong>{originalName}</strong><div style={{fontSize:12,color:"var(--selen-text2)",marginTop:4}}>Version {document.version} · {document.is_current ? "Version courante" : "Historique"} · {new Date(document.created_at).toLocaleDateString("fr-FR")}</div></div>
            <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
              <a href={`/agent/api/daily/documents/${document.id}`} target="_blank" rel="noreferrer noopener">Consulter</a>
              {document.is_current ? <label style={{cursor:busy ? "not-allowed" : "pointer",fontWeight:700}}>Remplacer<input hidden type="file" accept=".pdf,.doc,.docx,.odt,.xls,.xlsx,.jpg,.jpeg,.png" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void replaceDocument(document, file); event.currentTarget.value = ""; }}/></label> : null}
            </div>
          </div>
        </article>;
      })}
    </section>
  </form>;
}

function EntitySelect({ name, label, options }: { name: string; label: string; options: Option[] }) {
  return <label>{label}<select name={name} defaultValue="" style={input}><option value="">Aucun rattachement</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>;
}

const input: React.CSSProperties = {display:"block",width:"100%",marginTop:6,padding:"9px 10px",borderRadius:8,border:"1px solid var(--selen-border)",background:"var(--selen-surface)",color:"var(--selen-text)"};
