const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function fold(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function normalizeWatchSubmissionQuery(value) {
  const raw = first(value);
  return typeof raw === "string" ? raw.trim().slice(0, 80) : "";
}

export function normalizeWatchSubmissionCategory(value) {
  const category = first(value);
  return category === "regulatory" || category === "other" ? category : "all";
}

export function normalizeWatchSubmissionView(value) {
  return first(value) === "overdue" ? "overdue" : "all";
}

export function isWatchSubmissionOverdue(row, now = new Date()) {
  const timestamp = Date.parse(row.created_at);
  return Number.isFinite(timestamp) && now.getTime() - timestamp >= WEEK_MS;
}

function isRegulatory(row) {
  return row.watch_type === "regulatory";
}

function organisationName(row) {
  const organisation = Array.isArray(row.organisations) ? row.organisations[0] : row.organisations;
  return [organisation?.name, organisation?.legal_name].filter(Boolean).join(" ");
}

/**
 * Filtre uniquement une liste déjà bornée aux affectations de l'agent.
 * Aucun accès réseau ni mutation ; les résultats conservent l'ordre ancien d'abord.
 */
export function filterWatchSubmissions(rows, filters = {}, now = new Date()) {
  const query = fold(normalizeWatchSubmissionQuery(filters.q));
  const category = normalizeWatchSubmissionCategory(filters.categorie);
  const view = normalizeWatchSubmissionView(filters.vue);
  return rows.filter((row) => {
    if (category === "regulatory" && !isRegulatory(row)) return false;
    if (category === "other" && isRegulatory(row)) return false;
    if (view === "overdue" && !isWatchSubmissionOverdue(row, now)) return false;
    if (!query) return true;
    return fold([row.title, row.summary, row.source_url, row.analysis_and_improvement, organisationName(row)]
      .filter(Boolean).join(" ")).includes(query);
  }).sort((a, b) => {
    const firstDate = Date.parse(a.created_at);
    const secondDate = Date.parse(b.created_at);
    return Number.isFinite(firstDate) && Number.isFinite(secondDate) ? firstDate - secondDate : 0;
  });
}

export function watchSubmissionMetrics(rows, now = new Date()) {
  return {
    total: rows.length,
    overdue: rows.filter((row) => isWatchSubmissionOverdue(row, now)).length,
    regulatory: rows.filter(isRegulatory).length,
  };
}
