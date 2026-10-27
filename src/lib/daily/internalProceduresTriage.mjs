// Pure presentation helpers: call only after the server has scoped rows to the agent.
export function normalizeProcedureQuery(value) {
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === "string" ? text.trim().slice(0, 80) : "";
}

export function normalizeProcedureView(value) {
  const text = Array.isArray(value) ? value[0] : value;
  return ["all", "due", "draft", "active"].includes(text) ? text : "all";
}

function searchText(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

function priority(row) {
  if (row.annualReviewDue) return 0;
  if (row.procedure.status === "draft") return 1;
  return 2;
}

export function filterAndPrioritizeProcedures(rows, query, view) {
  const needle = searchText(normalizeProcedureQuery(query));
  const selectedView = normalizeProcedureView(view);
  return rows.filter((row) => {
    const matchesView = selectedView === "all"
      || (selectedView === "due" && row.annualReviewDue)
      || (selectedView === "draft" && row.procedure.status === "draft")
      || (selectedView === "active" && row.procedure.status === "active");
    if (!matchesView) return false;
    if (!needle) return true;
    return searchText([
      row.procedure.title,
      row.procedure.procedure_type,
      row.procedure.purpose,
      row.organisation?.legal_name,
      row.organisation?.name,
      row.procedure.internalTypeLabel,
    ].join(" ")).includes(needle);
  }).sort((a, b) => {
    const difference = priority(a) - priority(b);
    if (difference) return difference;
    const dateA = Date.parse(a.procedure.reviewed_at || a.procedure.updated_at || "") || 0;
    const dateB = Date.parse(b.procedure.reviewed_at || b.procedure.updated_at || "") || 0;
    return dateA - dateB || String(a.procedure.title).localeCompare(String(b.procedure.title), "fr");
  });
}

/** Les options proviennent uniquement des organismes affectés et non archivés. */
export function procedureOrganisationOptions(organisations, assignedIds) {
  const allowed = new Set(assignedIds);
  const names = new Map();
  for (const organisation of organisations) {
    if (!organisation || typeof organisation.id !== "string" || !allowed.has(organisation.id)) continue;
    if (organisation.status === "archived" || names.has(organisation.id)) continue;
    const name = [organisation.legal_name, organisation.name]
      .find((value) => typeof value === "string" && value.trim())?.trim();
    names.set(organisation.id, name || "Organisme Daily");
  }
  return [...names].map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr") || a.id.localeCompare(b.id));
}

/** null : paramètre explicite non autorisé, sans repli silencieux sur tous. */
export function selectProcedureOrganisation(raw, options) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || !options.some((option) => option.id === value)) return null;
  return value;
}
