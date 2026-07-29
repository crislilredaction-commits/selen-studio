"use client";

import { Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import type { NewPlanningMissionInput } from "@/lib/forge/data-access";
import { priorityLabels } from "@/lib/forge/labels";
import type { MissionPriority } from "@/lib/forge/types";

const emptyForm: NewPlanningMissionInput = {
  title: "",
  sourceRequest: "",
  sourceContext: "",
  sourceConstraints: "",
  priority: "normal",
};

const priorities: MissionPriority[] = ["low", "normal", "high", "urgent"];

export default function NewMissionForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (input: NewPlanningMissionInput) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.sourceRequest.trim()) return;
    await onSubmit(form);
    setForm(emptyForm);
    setOpen(false);
  }

  return (
    <section className="forge-planning-intake">
      <div>
        <p className="forge-eyebrow"><Sparkles size={14} /> Cadrage avant exécution</p>
        <h2>Confier une nouvelle demande à Cody</h2>
        <p>Cody analyse la demande et prépare un plan modifiable. Aucun fichier n’est touché avant validation.</p>
      </div>
      {!open ? (
        <button className="forge-button forge-button--primary" type="button" onClick={() => setOpen(true)}>
          <Plus size={16} /> Nouvelle mission
        </button>
      ) : (
        <form className="forge-planning-form" onSubmit={submit}>
          <label>
            <span>Titre facultatif</span>
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              maxLength={240}
              placeholder="Cody proposera un titre si ce champ reste vide"
            />
          </label>
          <label>
            <span>Priorité</span>
            <select
              value={form.priority}
              onChange={(event) => setForm({
                ...form,
                priority: event.target.value as MissionPriority,
              })}
            >
              {priorities.map((priority) => (
                <option key={priority} value={priority}>
                  {priorityLabels[priority]}
                </option>
              ))}
            </select>
          </label>
          <label className="forge-planning-form__wide">
            <span>Demande ou cahier des charges *</span>
            <textarea
              value={form.sourceRequest}
              onChange={(event) => setForm({ ...form, sourceRequest: event.target.value })}
              rows={8}
              required
              placeholder="Décrivez le besoin, le résultat attendu et le contexte utilisateur."
            />
          </label>
          <label>
            <span>Contexte complémentaire</span>
            <textarea
              value={form.sourceContext}
              onChange={(event) => setForm({ ...form, sourceContext: event.target.value })}
              rows={4}
            />
          </label>
          <label>
            <span>Contraintes ou exclusions</span>
            <textarea
              value={form.sourceConstraints}
              onChange={(event) => setForm({ ...form, sourceConstraints: event.target.value })}
              rows={4}
            />
          </label>
          <div className="forge-planning-form__actions">
            <button className="forge-button forge-button--secondary" type="button" onClick={() => setOpen(false)} disabled={busy}>
              Annuler
            </button>
            <button className="forge-button forge-button--primary" type="submit" disabled={busy || !form.sourceRequest.trim()}>
              <Sparkles size={16} /> {busy ? "Analyse en cours…" : "Créer et analyser"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
