// Le filtre s'applique uniquement aux inscriptions déjà limitées aux organismes de l'agent.
export function learnerOrganisationOptions(rows) {
  const options = new Map();
  for (const row of rows) {
    const id = typeof row?.organisation_id === "string" ? row.organisation_id : "";
    if (!id) continue;
    const relation = Array.isArray(row.organisations) ? row.organisations[0] : row.organisations;
    const name = typeof relation?.name === "string" && relation.name.trim() ? relation.name.trim() : "Organisme sans nom";
    if (!options.has(id)) options.set(id, { id, name });
  }
  return [...options.values()].sort((a, b) => a.name.localeCompare(b.name, "fr") || a.id.localeCompare(b.id));
}

// Une valeur inconnue ne doit jamais retomber silencieusement sur "tous les OF".
export function resolveLearnerOrganisation(value, options) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null || raw === "") return { id: null, valid: true };
  if (typeof raw !== "string" || !options.some((option) => option.id === raw)) {
    return { id: null, valid: false };
  }
  return { id: raw, valid: true };
}

export function filterLearnerOrganisation(rows, organisationId) {
  if (!organisationId) return rows;
  return rows.filter((row) => row.organisation_id === organisationId);
}
