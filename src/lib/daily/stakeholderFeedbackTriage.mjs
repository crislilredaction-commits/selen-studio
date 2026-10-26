/** Tri des retours déjà bornés aux organismes de l'agent, sans accès aux données ni mutation. */
const STAGES = new Set(["all", "review", "forward", "response", "close", "resolved"]);
const TYPES = new Set(["all", "complaint", "suggestion"]);
const PRIORITY = { review: 0, forward: 1, response: 2, close: 3, resolved: 4 };

function first(value) {
  return typeof value === "string" ? value : Array.isArray(value) && typeof value[0] === "string" ? value[0] : "";
}

function choice(value, allowed) {
  const selected = first(value);
  return allowed.has(selected) ? selected : "all";
}

function fold(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR").replace(/\s+/g, " ").trim();
}

export function normalizeStakeholderFeedbackFilters(params = {}) {
  return {
    q: first(params.q).trim().slice(0, 80),
    stage: choice(params.etape, STAGES),
    type: choice(params.type, TYPES),
  };
}

export function stakeholderFeedbackStage(row) {
  const item = row.item ?? row;
  if (item.status === "resolved" || item.resolved_at) return "resolved";
  if (String(item.organisation_response ?? "").trim()) return "close";
  if (item.forwarded_at || item.status === "forwarded_to_organisation") return "response";
  if (item.selen_reviewed_at || ["reviewed", "reviewed_by_selen"].includes(item.status)) return "forward";
  return "review";
}

export function countStakeholderFeedbackStages(rows) {
  const counts = { all: rows.length, review: 0, forward: 0, response: 0, close: 0, resolved: 0 };
  for (const row of rows) counts[stakeholderFeedbackStage(row)] += 1;
  return counts;
}

export function filterStakeholderFeedbackRows(rows, filters) {
  const query = fold(filters.q);
  return rows.filter((row) => {
    if (filters.stage !== "all" && stakeholderFeedbackStage(row) !== filters.stage) return false;
    if (filters.type !== "all" && row.item.submission_type !== filters.type) return false;
    if (!query) return true;
    return [row.item.subject, row.item.message, row.item.submitter_name,
      row.organisation?.legal_name, row.organisation?.name]
      .map(fold).join(" ").includes(query);
  }).sort((a, b) => {
    const aStage = stakeholderFeedbackStage(a);
    const bStage = stakeholderFeedbackStage(b);
    if (aStage !== bStage) return PRIORITY[aStage] - PRIORITY[bStage];
    if (a.item.submission_type !== b.item.submission_type) {
      return a.item.submission_type === "complaint" ? -1 : 1;
    }
    const aDate = Date.parse(a.item.created_at ?? "") || 0;
    const bDate = Date.parse(b.item.created_at ?? "") || 0;
    const dateOrder = aStage === "resolved" ? bDate - aDate : aDate - bDate;
    return dateOrder || String(a.item.id).localeCompare(String(b.item.id));
  });
}
