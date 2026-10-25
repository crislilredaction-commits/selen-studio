/**
 * Vues de lecture des relances déjà filtrées côté serveur pour l'agent.
 * Aucune vue ne peut élargir le périmètre autorisé.
 */
const VIEWS = new Set(["all", "undated", "overdue", "shared"]);

/** @param {unknown} raw */
export function normalizeDailyFollowupView(raw) {
  return typeof raw === "string" && VIEWS.has(raw) ? raw : "all";
}

/** @param {{ dueAt?: string | null }} item
 * @param {Date} now
 */
function isOverdueFollowup(item, now) {
  if (typeof item.dueAt !== "string" || !item.dueAt.trim()) return false;
  const due = Date.parse(item.dueAt);
  return Number.isFinite(due) && due < now.getTime();
}

/** @template {{ dueAt?: string | null, overdueShared?: boolean }} T
 * @param {readonly T[]} followups
 * @param {Date} [now]
 */
export function countDailyFollowupViews(followups, now = new Date()) {
  return {
    all: followups.length,
    undated: followups.filter(item => !item.dueAt).length,
    overdue: followups.filter(item => isOverdueFollowup(item, now)).length,
    shared: followups.filter(item => item.overdueShared === true).length,
  };
}

/** @template {{ dueAt?: string | null, overdueShared?: boolean }} T
 * @param {readonly T[]} followups
 * @param {unknown} rawView
 * @param {Date} [now]
 * @returns {T[]}
 */
export function filterDailyFollowupViews(followups, rawView, now = new Date()) {
  const view = normalizeDailyFollowupView(rawView);
  if (view === "undated") return followups.filter(item => !item.dueAt);
  if (view === "overdue") return followups.filter(item => isOverdueFollowup(item, now));
  if (view === "shared") return followups.filter(item => item.overdueShared === true);
  return [...followups];
}
