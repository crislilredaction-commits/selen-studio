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
};

export default function DelegatedDocumentUpload({ organisationId, trainers, learners, formations, sessions, enrolments }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    form.set("organisation_id", organisationId);
    const links = ["trainer", "learner", "formation", "session", "enrolment"]
      .map((type) => [type, String(form.get(`${type}_id`) ?? "").trim()] as const)
      .filter(([, id]) => id)
      .map(([type, id]) => `${type}:${id}`);
    form.delete("trainer_id"); form.delete("learner_id"); form.delete("formation_id"); form.delete("session_id"); form.delete("enrolment_id");
    form.append("link", `organisation:${organisationId}`);
    links.forEach((link) => form.append("link", link));
    const response = await fetch("/agent/api/daily/delegated-documents", { method: "POST", body: form });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setMessage(result.error || "Import impossible."); return; }
    setMessage(`Document importé et rattaché (${result.links} rattachement(s)).`);
    event.currentTarget.reset();
    router.refresh();
  }

  return <form onSubmit={submit} style={{display:"grid",gap:14,maxWidth:760}}>
    <label>Nom du document<input name="logical_name" required style={input}/></label>
    <label>Fichier<input name="file" type="file" required style={input}/></label>
    <p style={{margin:0,fontSize:13,color:"var(--selen-text2)"}}>Le document est toujours rattaché à l’organisme. Sélectionne seulement les rattachements complémentaires utiles. Aucun identifiant technique n’est à recopier.</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}>
      <EntitySelect name="trainer_id" label="Formateur" options={trainers}/>
      <EntitySelect name="learner_id" label="Apprenant" options={learners}/>
      <EntitySelect name="formation_id" label="Formation" options={formations}/>
      <EntitySelect name="session_id" label="Session" options={sessions}/>
      <EntitySelect name="enrolment_id" label="Inscription" options={enrolments}/>
    </div>
    <button type="submit" disabled={busy} style={{padding:"10px 14px",borderRadius:10,border:0,cursor:"pointer",fontWeight:700}}>{busy ? "Import en cours…" : "Importer pour le compte du client"}</button>
    {message ? <p role="status" style={{margin:0,fontSize:14}}>{message}</p> : null}
  </form>;
}

function EntitySelect({ name, label, options }: { name: string; label: string; options: Option[] }) {
  return <label>{label}<select name={name} defaultValue="" style={input}><option value="">Aucun rattachement</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>;
}

const input: React.CSSProperties = {display:"block",width:"100%",marginTop:6,padding:"9px 10px",borderRadius:8,border:"1px solid var(--selen-border)",background:"var(--selen-surface)",color:"var(--selen-text)"};
