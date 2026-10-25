/** Recherche locale sur les tâches déjà autorisées à être consultées par l'agent. */
export function normalizeDailyPilotageQuery(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 80).trim() : "";
}

const fold = (value) => String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr-FR");

/**
 * Aucun accès aux données supplémentaire : recherche seulement dans la liste
 * fournie par le pilotage, sans modifier droits, attributions ni tâches.
 * @template T
 * @param {readonly T[]} tasks
 * @param {unknown} query
 * @param {(task: T) => string} searchableText
 * @returns {T[]}
 */
export function searchDailyPilotageTasks(tasks, query, searchableText) {
  const normalized = normalizeDailyPilotageQuery(query);
  if (!normalized) return [...tasks];
  const words = fold(normalized).split(" ");
  return tasks.filter(task => {
    const text = fold(searchableText(task));
    return words.every(word => text.includes(word));
  });
}
