/**
 * Vues de lecture des relances déjà filtrées côté serveur pour l'agent.
 * Aucune vue ne peut élargir le périmètre autorisé.
 */
const VIEWS = new Set(["all", "undated", "shared"]);

/** @param {unknown} raw */
export function normalizeDailyFollowupView(raw) {
  return typeof raw === "string" && VIEWS.has(raw) ? raw : "all";
}

/** @template {{ dueAt?: string | null, overdueShared?: boolean }} T
 * @param {readonly T[]} followups
 */
export function countDailyFollowupViews(followups) {
  return {
    all: followups.length,
    undated: followups.filter(item => !item.dueAt).length,
    shared: followups.filter(item => item.overdueShared === true).length,
  };
}

/** @template {{ dueAt?: string | null, overdueShared?: boolean }} T
 * @param {readonly T[]} followups
 * @param {unknown} rawView
 * @returns {T[]}
 */
export function filterDailyFollowupViews(followups, rawView) {
  const view = normalizeDailyFollowupView(rawView);
  if (view === "undated") return followups.filter(item => !item.dueAt);
  if (view === "shared") return followups.filter(item => item.overdueShared === true);
  return [...followups];
}
