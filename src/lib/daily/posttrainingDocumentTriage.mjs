/**
 * Triage en lecture seule : l'API a deja filtre les organismes autorises.
 * Ne jamais indexer le contenu des documents, les hash ou les tokens de metadata.
 */
const attention = new Set(["to_check", "to_validate", "correction_requested", "validated"]);
const priorities = { correction_requested: 0, to_check: 1, to_validate: 2, validated: 3 };

export function normalizePosttrainingQuery(raw) {
  return typeof raw === "string" ? raw.trim().slice(0, 80) : "";
}

export function normalizePosttrainingView(raw) {
  return ["attention", "all", "corrections", "ready"].includes(raw) ? raw : "attention";
}

export function normalizePosttrainingType(raw) {
  return ["all", "attendance_summary", "completion_certificate"].includes(raw) ? raw : "all";
}

function comparable(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

export function posttrainingDocumentMetrics(rows) {
  return {
    total: rows.length,
    attention: rows.filter(row => attention.has(row.status)).length,
    corrections: rows.filter(row => row.status === "correction_requested").length,
    ready: rows.filter(row => row.status === "validated").length,
  };
}

export function filterPosttrainingDocuments(rows, options = {}) {
  const query = comparable(normalizePosttrainingQuery(options.query));
  const view = normalizePosttrainingView(options.view);
  const type = normalizePosttrainingType(options.type);
  return rows.filter(row => {
    if (type !== "all" && row.document_type !== type) return false;
    if (view === "attention" && !attention.has(row.status)) return false;
    if (view === "corrections" && row.status !== "correction_requested") return false;
    if (view === "ready" && row.status !== "validated") return false;
    if (!query) return true;
    const searchText = [
      row.organisations?.name,
      row.metadata?.learner_name,
      row.metadata?.session_reference,
      row.document_type === "attendance_summary" ? "releve presences emargement" : "certificat realisation",
    ].join(" ");
    return comparable(searchText).includes(query);
  }).sort((a, b) => {
    const priority = (priorities[a.status] ?? 4) - (priorities[b.status] ?? 4);
    if (priority) return priority;
    const left = Date.parse(a.updated_at ?? a.created_at ?? "") || 0;
    const right = Date.parse(b.updated_at ?? b.created_at ?? "") || 0;
    return right - left;
  });
}
