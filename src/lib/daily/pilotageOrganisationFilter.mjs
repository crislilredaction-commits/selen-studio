/** Filtre de lecture : ne propose que les organismes des tâches déjà visibles. */

/**
 * @template {{ organisationId: string, organisation: string }} T
 * @param {readonly T[]} tasks
 */
export function dailyPilotageOrganisationOptions(tasks) {
  const organisations = new Map();
  for (const task of tasks) {
    const id = typeof task.organisationId === "string" ? task.organisationId.trim() : "";
    if (!id) continue;
    const name = typeof task.organisation === "string" && task.organisation.trim() ? task.organisation.trim() : "Organisme sans nom";
    if (!organisations.has(id)) organisations.set(id, { id, name, count: 0 });
    organisations.get(id).count++;
  }
  return [...organisations.values()].sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }) || a.id.localeCompare(b.id));
}

/** @param {unknown} value
 *  @param {readonly { id: string }[]} organisations
 */
export function selectDailyPilotageOrganisation(value, organisations) {
  return typeof value === "string" && organisations.some(item => item.id === value) ? value : "";
}

/** @template {{ organisationId: string }} T
 *  @param {readonly T[]} tasks
 *  @param {string} selectedOrganisation
 *  @returns {T[]}
 */
export function filterDailyPilotageOrganisationTasks(tasks, selectedOrganisation) {
  return selectedOrganisation ? tasks.filter(task => task.organisationId === selectedOrganisation) : [...tasks];
}
