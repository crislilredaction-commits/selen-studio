/** Périmètre de lecture seule du suivi satisfaction : ne jamais accepter un OF hors affectation. */
export function satisfactionOrganisationOptions(organisations, assignedIds) {
  const allowed = new Set(assignedIds);
  return organisations
    .filter((organisation) => allowed.has(organisation.id))
    .map((organisation) => ({
      id: organisation.id,
      name: organisation.name?.trim() || organisation.legal_name?.trim() || "Organisme Daily",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function selectSatisfactionOrganisation(raw, options) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || !options.some((option) => option.id === value)) return null;
  return value;
}
