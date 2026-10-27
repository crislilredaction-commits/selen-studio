/** Périmètre des réclamations et suggestions : sélection sans élargissement des affectations agent. */
export function stakeholderFeedbackOrganisationOptions(organisations, assignedIds) {
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

/** null = sélection explicitement invalide : ne jamais revenir silencieusement à « tous ». */
export function selectStakeholderFeedbackOrganisation(raw, options) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || !options.some((option) => option.id === value)) return null;
  return value;
}
