/**
 * Lecture seule : les paramètres sont validés contre le périmètre agent avant
 * les lectures service-role. Aucun ID fourni par le navigateur n'élargit ce périmètre.
 */
export function resolveIndicatorOrganisationSelection(raw, allowedIds) {
  if (raw === undefined || raw === null || raw === "") return { id: null, valid: true };
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (typeof id !== "string" || id.length > 100 || !allowedIds.includes(id)) {
    return { id: null, valid: false };
  }
  return { id, valid: true };
}

export function normalizeIndicatorQuery(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 80) : "";
}

export function normalizeIndicatorView(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "attention" ? "attention" : "all";
}

/**
 * @template {{ organisation_id?: string | null }} T
 * @param {T[]} rows
 * @param {string | null} selectedId
 * @returns {T[]}
 */
export function filterIndicatorRowsByOrganisation(rows, selectedId) {
  return selectedId ? rows.filter((row) => row.organisation_id === selectedId) : rows;
}

export function getIndicatorAttentionCount({ enrolments, attendance, assessments, learnerFeedback, stakeholderFeedback }) {
  const pendingAttendance = attendance.filter((row) => row.status === "pending").length;
  const pendingAssessments = assessments.filter((row) => row.outcome === "pending").length;
  const abandoned = enrolments.filter((row) => row.status === "abandoned").length;
  const completed = enrolments.filter((row) => row.status === "completed").length;
  const noSatisfaction = completed > 0 && learnerFeedback.length + stakeholderFeedback.length === 0 ? 1 : 0;
  return {
    pendingAttendance,
    pendingAssessments,
    abandoned,
    noSatisfaction,
    count: pendingAttendance + pendingAssessments + abandoned + noSatisfaction,
  };
}

function comparable(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

export function filterIndicatorOrganisations(organisations, rawQuery, rawView, attentionByOrg) {
  const query = comparable(normalizeIndicatorQuery(rawQuery));
  const view = normalizeIndicatorView(rawView);
  return organisations
    .filter((org) => !query || comparable([org.name, org.legal_name].join(" ")).includes(query))
    .filter((org) => view !== "attention" || (attentionByOrg.get(org.id)?.count ?? 0) > 0)
    .sort((a, b) =>
      (attentionByOrg.get(b.id)?.count ?? 0) - (attentionByOrg.get(a.id)?.count ?? 0)
      || String(a.legal_name || a.name || "").localeCompare(String(b.legal_name || b.name || ""), "fr")
    );
}
