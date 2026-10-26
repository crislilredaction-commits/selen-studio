/**
 * Synthèse de la checklist du planning, calculée uniquement sur les lignes
 * déjà récupérées pour les sessions autorisées. Aucune lecture ni mutation.
 * @param {readonly {session_id: string, status: string}[]} items
 * @returns {Map<string, number>}
 */
export function countOpenDailySessionChecklistItems(items) {
  const counts = new Map();
  for (const item of items) {
    if (!item || typeof item.session_id !== "string" || !item.session_id) continue;
    if (item.status === "validated" || item.status === "not_applicable") continue;
    counts.set(item.session_id, (counts.get(item.session_id) ?? 0) + 1);
  }
  return counts;
}
