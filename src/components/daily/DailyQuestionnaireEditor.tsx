"use client";

import { useId, useState } from "react";
import DailyQuestionnairePreview from "./DailyQuestionnairePreview";
import type { DailyEditableQuestion } from "@/lib/dailyQuestionnaireEditing";

export default function DailyQuestionnaireEditor({ questions, assessment = false }: { questions: unknown; assessment?: boolean }) {
  const prefix = useId();
  const [rows, setRows] = useState<DailyEditableQuestion[]>(() => (Array.isArray(questions) ? questions : []).map((raw, index) => {
    const q = raw && typeof raw === "object" ? raw as Partial<DailyEditableQuestion> : {};
    const str = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";
    return { id: str(q.id) || "legacy_" + index, label: str(q.label), type: str(q.type), options: Array.isArray(q.options) ? q.options.map(str).filter(Boolean) : [], required: q.required !== false, order: index + 1, ...(assessment ? { correct_answers: Array.isArray(q.correct_answers) ? q.correct_answers.map(str).filter(Boolean) : [], points: Number.isFinite(Number(q.points)) ? Number(q.points) : 1 } : { help_text: str(q.help_text) }) };
  }));
  const name = assessment ? "learning_assessment_questions" : "positioning_questions";
  function update(index: number, patch: Partial<DailyEditableQuestion>) {
    setRows(current => current.map((q, i) => i === index ? { ...q, ...patch } : q));
  }
  return <div style={{ display: "grid", gap: 14 }}>
    <input type="hidden" name={name} value={JSON.stringify(rows)} />
    {!rows.length ? <p>Ajoute une première question pour utiliser le questionnaire Selen.</p> : null}
    {rows.map((q, index) => {
      const choice = q.type === "single_choice" || q.type === "multiple_choice";
      const field = prefix + "-" + index;
      return <fieldset key={q.id} style={{ border: "1px solid var(--selen-border)", borderRadius: 10, padding: 14, display: "grid", gap: 10, minWidth: 0 }}>
        <legend>Question {index + 1}</legend>
        <label htmlFor={field + "-label"}>Intitulé</label>
        <textarea id={field + "-label"} value={q.label} onChange={e => update(index, { label: e.target.value })} rows={2} style={input} />
        <label htmlFor={field + "-type"}>Type de réponse</label>
        <select id={field + "-type"} value={q.type} style={input} onChange={e => {
          const choice = ["single_choice", "multiple_choice"].includes(e.target.value);
          update(index, { type: e.target.value, options: choice ? q.options : [], correct_answers: choice ? (e.target.value === "single_choice" ? (q.correct_answers || []).slice(0, 1) : q.correct_answers) : [] });
        }}>
          {!["free_text", "single_choice", "multiple_choice", "scale_1_5"].includes(q.type) ? <option value={q.type}>Type non renseigné</option> : null}
          <option value="free_text">Réponse libre</option><option value="single_choice">Choix unique</option><option value="multiple_choice">Choix multiple</option>
          {!assessment ? <option value="scale_1_5">Échelle de 1 à 5</option> : null}
        </select>
        {!assessment ? <><label htmlFor={field + "-help"}>Aide à la réponse</label><textarea id={field + "-help"} value={q.help_text || ""} onChange={e => update(index, { help_text: e.target.value })} style={input} /></> : null}
        <label><input type="checkbox" checked={q.required} onChange={e => update(index, { required: e.target.checked })} /> Réponse obligatoire</label>
        {choice ? <><label htmlFor={field + "-options"}>Choix proposés (un par ligne)</label><textarea id={field + "-options"} value={q.options.join("\n")} onChange={e => {
          const options = e.target.value.split("\n");
          update(index, { options, correct_answers: (q.correct_answers || []).filter(answer => options.map(s => s.trim()).includes(answer)) });
        }} rows={4} style={input} /></> : null}
        {assessment ? <>
          <label htmlFor={field + "-points"}>Nombre de points</label><input id={field + "-points"} type="number" min="0" step="any" value={q.points ?? 1} onChange={e => update(index, { points: Number(e.target.value) })} style={input} />
          {choice ? <fieldset style={{ border: 0, padding: 0 }}><legend>Réponses attendues</legend>{q.options.filter(s => s.trim()).map((option, i) => <label key={i} style={{ display: "block", padding: "5px 0" }}><input type={q.type === "single_choice" ? "radio" : "checkbox"} name={field + "-answer"} checked={(q.correct_answers || []).includes(option.trim())} onChange={e => update(index, { correct_answers: q.type === "single_choice" ? [option.trim()] : e.target.checked ? [...(q.correct_answers || []), option.trim()] : (q.correct_answers || []).filter(answer => answer !== option.trim()) })} /> {option}</label>)}</fieldset> : null}
        </> : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" disabled={index === 0} onClick={() => setRows(current => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>Monter</button>
          <button type="button" disabled={index === rows.length - 1} onClick={() => setRows(current => { const next = [...current]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next; })}>Descendre</button>
          <button type="button" onClick={() => setRows(current => current.filter((_, i) => i !== index))}>Retirer cette question</button>
        </div>
      </fieldset>;
    })}
    <button type="button" onClick={() => setRows(current => [...current, { id: crypto.randomUUID(), label: "", type: "free_text", options: [], required: true, order: current.length + 1, ...(assessment ? { correct_answers: [], points: 1 } : { help_text: "" }) }])}>+ Ajouter une question</button>
    <details><summary>Aperçu du questionnaire</summary><DailyQuestionnairePreview questions={rows} assessment={assessment} /></details>
    <p style={{ fontSize: 13, color: "var(--selen-text2)" }}>Les modifications sont enregistrées avec les boutons en bas du dossier.</p>
  </div>;
}

const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid var(--selen-border)", borderRadius: 8, background: "var(--selen-bg3)", color: "var(--selen-text)", padding: "10px 11px" };
