/**
 * Filtres de lecture seule appliqués après la résolution du périmètre agent.
 * Une session sans apprenant attendu n'est jamais présentée comme complète.
 */
export function normalizeDailySatisfactionView(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "missing" || value === "complete" ? value : "all";
}

export function normalizeDailySatisfactionQuery(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function comparable(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

export function filterDailySatisfactionRows(rows, rawQuery, rawView, searchText) {
  const query = comparable(normalizeDailySatisfactionQuery(rawQuery));
  const view = normalizeDailySatisfactionView(rawView);
  return rows
    .filter(row => view === "missing" ? row.missingLearners > 0
      : view === "complete" ? row.expectedLearners > 0 && row.learnerComplete === true
      : true)
    .filter(row => !query || comparable(searchText(row)).includes(query))
    .sort((a, b) => view === "missing" ? b.missingLearners - a.missingLearners : 0);
}
