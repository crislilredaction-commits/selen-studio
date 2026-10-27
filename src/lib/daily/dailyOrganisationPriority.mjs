/**
 * Classement de vigilance pour des organismes DEJA bornés au périmètre agent.
 * Ne charge ni ne modifie aucune donnée. Les catégories ne constituent pas un verdict Qualiopi.
 * @template {{id: string, name: string, legal_name?: string | null}} T
 * @param {readonly T[]} organisations
 * @param {{taskCounts: ReadonlyMap<string, number>, validationCounts: ReadonlyMap<string, number>, certificationCounts: ReadonlyMap<string, number>, programmeCounts: ReadonlyMap<string, number>, assignedIds: ReadonlySet<string>}} options
 */
export function buildDailyOrganisationPriorityRows(organisations, options) {
  return organisations.map((organisation) => {
    const tasks = options.taskCounts.get(organisation.id) ?? 0;
    const validations = options.validationCounts.get(organisation.id) ?? 0;
    const certifications = options.certificationCounts.get(organisation.id) ?? 0;
    const programmesToFinalize = options.programmeCounts.get(organisation.id) ?? 0;
    const unassigned = !options.assignedIds.has(organisation.id);
    const priorityRank = validations > 0 ? 0 : certifications > 0 ? 1 : tasks > 0 ? 2 : unassigned ? 3 : programmesToFinalize > 0 ? 4 : 5;
    const priorityLabel = ["Profil à valider", "Certification à surveiller", "Tâches à traiter", "Agent à affecter", "Programmes à finaliser", "Aucune alerte"][priorityRank];
    return { ...organisation, priorityRank, priorityLabel, priorityCount: validations + certifications + tasks + (unassigned ? 1 : 0) + programmesToFinalize, programmesToFinalize };
  });
}

/** @template {{id: string, name: string, legal_name?: string | null, priorityRank: number, priorityCount: number, programmesToFinalize: number}} T
 * @param {readonly T[]} rows
 * @param {string} sort
 */
export function sortDailyOrganisationPriorityRows(rows, sort = "priority") {
  const byName = (a, b) => (a.legal_name || a.name).localeCompare(b.legal_name || b.name, "fr", { sensitivity: "base" }) || a.id.localeCompare(b.id);
  return [...rows].sort((a, b) => {
    if (sort === "name") return byName(a, b);
    if (sort === "programmes") return b.programmesToFinalize - a.programmesToFinalize || byName(a, b);
    return a.priorityRank - b.priorityRank || b.priorityCount - a.priorityCount || byName(a, b);
  });
}
