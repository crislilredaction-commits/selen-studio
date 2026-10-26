// Tri des escalades déjà bornées par l'authentification et les affectations agent.
const STATUSES = ["open", "in_progress", "returned", "resolved"];

const first = (value) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
const normalize = (value) => String(value ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim();

export function normalizeEscalationFilters(params = {}) {
  const q = String(first(params.q)).trim().slice(0, 80);
  const requestedStatus = String(first(params.etat));
  return { q, status: STATUSES.includes(requestedStatus) ? requestedStatus : "all" };
}

export function countEscalationStatuses(rows) {
  const counts = { all: rows.length, open: 0, in_progress: 0, returned: 0, resolved: 0 };
  for (const row of rows) {
    if (Object.hasOwn(counts, row.status) && row.status !== "all") counts[row.status] += 1;
  }
  return counts;
}

export function triageEscalations(rows, filters, emailById = new Map(), isAdmin = false) {
  const needle = normalize(filters.q);
  const rank = isAdmin
    ? { open: 0, in_progress: 1, returned: 2, resolved: 3 }
    : { returned: 0, open: 1, in_progress: 2, resolved: 3 };
  return rows.filter((row) => {
    if (filters.status !== "all" && row.status !== filters.status) return false;
    if (!needle) return true;
    return normalize([
      row.task_title, row.reason, row.task_key, row.resolution_note,
      emailById.get(row.escalated_by), emailById.get(row.handled_by),
    ].join(" ")).includes(needle);
  }).sort((a, b) => {
    const stage = (rank[a.status] ?? 4) - (rank[b.status] ?? 4);
    if (stage) return stage;
    const aTime = Date.parse(a.created_at) || 0;
    const bTime = Date.parse(b.created_at) || 0;
    const chronological = a.status === "resolved" ? bTime - aTime : aTime - bTime;
    return chronological || String(a.id).localeCompare(String(b.id));
  });
}
