/**
 * Raccorde uniquement les suivis des organismes Daily autorisés à l'agent.
 * Les références de session inter-organismes sont exclues et une formation
 * étrangère n'est jamais jointe. Cette fonction est pure, sans accès DB.
 */
export function buildScopedSessionFollowupRows(entries, sessions, formations, organisations, allowedOrganisationIds) {
  const allowed = new Set(allowedOrganisationIds);
  const sessionById = new Map(sessions.filter((row) => allowed.has(row.organisation_id)).map((row) => [row.id, row]));
  const formationById = new Map(formations.filter((row) => allowed.has(row.organisation_id)).map((row) => [row.id, row]));
  const organisationById = new Map(organisations.filter((row) => allowed.has(row.id)).map((row) => [row.id, row]));

  return entries.flatMap((entry) => {
    if (!allowed.has(entry.organisation_id)) return [];
    const organisation = organisationById.get(entry.organisation_id);
    if (!organisation) return [];
    const session = sessionById.get(entry.session_id);
    if (session && session.organisation_id !== entry.organisation_id) return [];
    const candidateFormation = session?.formation_id ? formationById.get(session.formation_id) : undefined;
    const formation = candidateFormation?.organisation_id === entry.organisation_id ? candidateFormation : undefined;
    const actionable = Boolean(session && !["archived", "cancelled"].includes(String(session.status ?? "")));
    return [{ entry, session, formation, organisation, actionable }];
  });
}
