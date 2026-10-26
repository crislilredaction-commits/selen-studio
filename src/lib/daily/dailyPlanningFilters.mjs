/**
 * Filtres purement visuels du planning actif Studio.
 * Le serveur résout d'abord les organismes affectés ; ce module n'élargit jamais ce périmètre.
 */
export const DAILY_PLANNING_STATES = {
  prepare: "À préparer",
  ready: "Prête",
  current: "En cours",
  close: "À clôturer",
  dates: "Dates à vérifier",
};

export function normalizeDailyPlanningQuery(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

export function normalizeDailyPlanningState(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && Object.hasOwn(DAILY_PLANNING_STATES, value) ? value : "all";
}

function comparable(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

export function filterDailyPlanningRows(rows, rawQuery, rawState) {
  const query = comparable(normalizeDailyPlanningQuery(rawQuery));
  const state = normalizeDailyPlanningState(rawState);
  return rows.filter(row => {
    if (state !== "all" && row.state !== DAILY_PLANNING_STATES[state]) return false;
    return !query || comparable([row.organisationName, row.formationTitle, row.reference].join(" ")).includes(query);
  });
}
