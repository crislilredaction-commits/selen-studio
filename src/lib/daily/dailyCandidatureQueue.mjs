/**
 * File de triage Studio. La sélection des organismes autorisés doit être réalisée
 * côté serveur AVANT tout appel à ces fonctions de présentation.
 */
export const CANDIDATURE_VIEWS = {
  all: "Toutes",
  evidence: "Justificatifs à vérifier",
  rejected: "Justificatifs refusés",
  analysis: "Analyses à réaliser",
  decision: "Décision OF attendue",
};

export function normalizeCandidatureSearch(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

export function normalizeCandidatureView(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && Object.hasOwn(CANDIDATURE_VIEWS, value) ? value : "all";
}

function comparable(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

export function candidatureQueueCategory(row, evidenceByRequest) {
  if (row.decision_status === "ready_for_of") return "decision";
  const counts = evidenceByRequest.get(row.id) ?? {};
  if ((counts.submitted ?? 0) > 0) return "evidence";
  if ((counts.rejected ?? 0) > 0) return "rejected";
  return "analysis";
}

export function countCandidatureQueueViews(rows, evidenceByRequest) {
  const counts = { all: rows.length, evidence: 0, rejected: 0, analysis: 0, decision: 0 };
  for (const row of rows) counts[candidatureQueueCategory(row, evidenceByRequest)]++;
  return counts;
}

export function filterCandidatureQueue(rows, rawQuery, rawView, evidenceByRequest) {
  const query = comparable(normalizeCandidatureSearch(rawQuery));
  const view = normalizeCandidatureView(rawView);
  return rows.filter(row => {
    if (view !== "all" && candidatureQueueCategory(row, evidenceByRequest) !== view) return false;
    if (!query) return true;
    const formation = Array.isArray(row.daily_formations) ? row.daily_formations[0] : row.daily_formations;
    return comparable([
      row.respondent_first_name,
      row.respondent_last_name,
      row.respondent_email,
      row.company_name,
      formation?.title,
    ].join(" ")).includes(query);
  });
}

export function prioritizeCandidatureQueue(rows, evidenceByRequest) {
  const rank = { evidence: 0, rejected: 1, analysis: 2, decision: 3 };
  return [...rows].sort((a, b) =>
    rank[candidatureQueueCategory(a, evidenceByRequest)] - rank[candidatureQueueCategory(b, evidenceByRequest)]
    || String(a.submitted_at ?? "").localeCompare(String(b.submitted_at ?? ""))
    || String(a.id).localeCompare(String(b.id))
  );
}
