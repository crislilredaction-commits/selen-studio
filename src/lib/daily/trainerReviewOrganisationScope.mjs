// Sélecteur sans élargissement du périmètre agent : seules les affectations autorisées sont proposées.
export function trainerReviewOrganisationOptions(organisations, assignedIds) {
  const allowed = new Set(assignedIds);
  const names = new Map();
  for (const organisation of organisations) {
    if (!organisation || typeof organisation.id !== "string" || !allowed.has(organisation.id)) continue;
    if (names.has(organisation.id)) continue;
    const name = [organisation.legal_name, organisation.name]
      .find((value) => typeof value === "string" && value.trim())?.trim();
    names.set(organisation.id, name || "Organisme sans nom");
  }
  return [...names].map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr") || a.id.localeCompare(b.id));
}

// null signifie un identifiant demandé mais non autorisé : ne jamais revenir silencieusement à "tous".
export function selectTrainerReviewOrganisation(raw, options) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !value) return "";
  return options.some((organisation) => organisation.id === value) ? value : null;
}
