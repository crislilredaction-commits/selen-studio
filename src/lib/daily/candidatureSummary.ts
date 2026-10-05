// Explicit projection of the already-authorized candidature DTO, shared by UI and PDF.
const sections = [
  ["motivation_summary", "Motivation"],
  ["expectations_summary", "Attentes"],
  ["positioning_summary", "Positionnement"],
  ["needs_summary", "Besoins"],
  ["adaptations_summary", "Adaptations"],
  ["prerequisites_comment", "Prérequis"],
  ["observations", "Observations"],
] as const;

export type CandidatureSummarySource = {
  applicant_label?: unknown;
  formation_title?: unknown;
  submitted_at?: unknown;
  agent_analysis_completed_at?: unknown;
  agent_analysis_summary?: unknown;
  decision_status?: unknown;
};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : "";
const date = (value: unknown) => {
  const raw = text(value);
  const day = raw.match(/^\d{4}-\d{2}-\d{2}(?=$|T)/)?.[0];
  if (!day || !Number.isFinite(Date.parse(raw)) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) return "Non renseignée";
  return new Date(raw).toLocaleString("fr-FR");
};
export function projectCandidatureSummary(source: CandidatureSummarySource) {
  const raw = source.agent_analysis_summary;
  const summary = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const values = sections.map(([key, label]) => ({ key, label, value: text(summary[key]) || "Non renseigné" }));
  const statuses: Record<string, string> = { pending: "Analyse Selen en cours", ready_for_of: "Analyse Selen terminée · décision OF attendue", accepted: "Acceptée", refused: "Refusée" };
  return {
    available: sections.some(([key]) => Boolean(text(summary[key]))),
    applicant: text(source.applicant_label) || "Non renseigné",
    formation: text(source.formation_title) || "Non renseignée",
    submittedAt: date(source.submitted_at),
    analyzedAt: date(source.agent_analysis_completed_at),
    status: Object.hasOwn(statuses, text(source.decision_status)) ? statuses[text(source.decision_status)] : "Non renseigné",
    sections: values,
  };
}
export function candidatureSummaryFilename(applicant: string) {
  const slug = applicant.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  return `synthese-candidature-${slug || "candidat"}.pdf`;
}
