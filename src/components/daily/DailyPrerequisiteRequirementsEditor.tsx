"use client";

import { useState } from "react";

type Requirement = { id: string; label: string; description?: string; required?: boolean };

export default function DailyPrerequisiteRequirementsEditor({ initial, disabled }: { initial: Requirement[]; disabled: boolean }) {
  const [rows, setRows] = useState<Requirement[]>(() => initial.map((row) => ({ ...row, required: row.required !== false })));
  const update = (index: number, patch: Partial<Requirement>) => setRows((current) => current.map((row, i) => i === index ? { ...row, ...patch } : row));
  return <div style={{ display: "grid", gap: 12 }}>
    <input type="hidden" name="prerequisite_requirements" value={JSON.stringify(rows)} disabled={disabled} />
    <p style={{ margin: 0, opacity: .8 }}>Définissez les pièces demandées après le positionnement. Une pièce facultative peut être laissée vide par l'apprenant.</p>
    {rows.length === 0 ? <p>Aucun justificatif nécessaire.</p> : null}
    {rows.map((row, index) => <fieldset key={row.id} style={{ border: "1px solid var(--selen-border, #bbb)", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
      <legend>Document {index + 1}</legend>
      <label>Intitulé<input value={row.label} maxLength={500} disabled={disabled} onChange={(event) => update(index, { label: event.target.value })} style={{ display: "block", width: "100%" }} /></label>
      <label>Consigne<textarea value={row.description ?? ""} maxLength={2000} disabled={disabled} onChange={(event) => update(index, { description: event.target.value })} style={{ display: "block", width: "100%" }} /></label>
      <label><input type="checkbox" checked={row.required !== false} disabled={disabled} onChange={(event) => update(index, { required: event.target.checked })} /> Obligatoire pour l'admission</label>
      {!disabled ? <button type="button" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>Retirer cette demande</button> : null}
    </fieldset>)}
    {!disabled && rows.length < 30 ? <button type="button" onClick={() => setRows((current) => [...current, { id: crypto.randomUUID(), label: "", description: "", required: true }])}>Ajouter un justificatif</button> : null}
  </div>;
}
