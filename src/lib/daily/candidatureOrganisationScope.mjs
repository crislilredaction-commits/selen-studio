// Options d'organismes déduites exclusivement de la liste d'affectations validée côté serveur.
export function candidatureOrganisationOptions(organisations, assignedIds) {
  const allowed = new Set(assignedIds);
  const names = new Map();
  for (const organisation of organisations) {
    if (!organisation || typeof organisation.id !== "string" || !allowed.has(organisation.id)) continue;
    if (names.has(organisation.id)) continue;
    const name = typeof organisation.name === "string" ? organisation.name.trim() : "";
    names.set(organisation.id, name || "Organisme sans nom");
  }
  return [...names].map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr") || a.id.localeCompare(b.id));
}
