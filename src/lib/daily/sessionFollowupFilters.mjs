/** Filtres purs appliqués seulement après le bornage canonique des organismes de l'agent. */
const STATES = new Set(["all", "open", "resolved", "history"]);
const LEVELS = new Set(["all", "critical", "attention", "info"]);
const TYPES = new Set(["all", "incident", "adaptation", "note", "absence", "delay", "abandonment_alert"]);

function first(value) {
  return typeof value === "string" ? value : Array.isArray(value) && typeof value[0] === "string" ? value[0] : "";
}

function choice(value, allowed) {
  const selected = first(value);
  return allowed.has(selected) ? selected : "all";
}

function fold(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR");
}

export function normalizeSessionFollowupFilters(params = {}) {
  return {
    q: first(params.q).trim().slice(0, 80),
    state: choice(params.etat, STATES),
    level: choice(params.niveau, LEVELS),
    type: choice(params.type, TYPES),
  };
}

export function sessionFollowupState(row) {
  if (!row.actionable) return "history";
  if (row.entry.status === "resolved") return "resolved";
  return row.entry.status === "open" ? "open" : "history";
}

export function countSessionFollowupStates(rows) {
  const counts = { all: rows.length, open: 0, resolved: 0, history: 0 };
  for (const row of rows) counts[sessionFollowupState(row)] += 1;
  return counts;
}

export function filterSessionFollowupRows(rows, filters) {
  const query = fold(filters.q);
  const priorities = { open: 0, resolved: 3, history: 4 };
  const severity = { critical: 0, attention: 1, info: 2 };
  return rows.filter((row) => {
    const state = sessionFollowupState(row);
    if (filters.state !== "all" && filters.state !== state) return false;
    if (filters.level !== "all" && filters.level !== row.entry.level) return false;
    if (filters.type !== "all" && filters.type !== row.entry.entry_type) return false;
    if (!query) return true;
    const haystack = [
      row.entry.summary, row.entry.description,
      row.organisation?.legal_name, row.organisation?.name,
      row.formation?.title, row.session?.internal_reference,
    ].map(fold).join(" ");
    return haystack.includes(query);
  }).sort((a, b) => {
    const aState = sessionFollowupState(a);
    const bState = sessionFollowupState(b);
    const aPriority = priorities[aState] + (aState === "open" ? (severity[a.entry.level] ?? 2) : 0);
    const bPriority = priorities[bState] + (bState === "open" ? (severity[b.entry.level] ?? 2) : 0);
    if (aPriority !== bPriority) return aPriority - bPriority;
    const aDate = Date.parse(a.entry.occurred_at ?? "") || 0;
    const bDate = Date.parse(b.entry.occurred_at ?? "") || 0;
    return bDate - aDate;
  });
}

/** Refuse tout organisme non affecté avant les lectures service-role du suivi. */
export function resolveSessionFollowupOrganisationSelection(raw, allowedIds) {
  if (raw === undefined || raw === null || raw === "") return { id: null, valid: true };
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (typeof id !== "string" || id.length > 100 || !allowedIds.includes(id)) return { id: null, valid: false };
  return { id, valid: true };
}
