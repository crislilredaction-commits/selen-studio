/**
 * Familles d'actions de relance sur la seule file déjà autorisée à l'agent.
 * La classification n'ouvre aucun dossier et ne modifie ni droits ni statut.
 */
const CATEGORIES = new Set(["all", "attendance", "signature", "documents", "feedback", "other"]);

/** @param {unknown} raw */
export function normalizeDailyFollowupCategory(raw) {
  return typeof raw === "string" && CATEGORIES.has(raw) ? raw : "all";
}

/** @param {{ reminderType?: string | null }} item */
export function dailyFollowupCategory(item) {
  const type = typeof item.reminderType === "string" ? item.reminderType.toLowerCase() : "";
  if (/attendance|emarg|presence|regulariz/.test(type)) return "attendance";
  if (/signature|convention/.test(type)) return "signature";
  if (/document|piece|justificatif|certificate|certificat|programme/.test(type)) return "documents";
  if (/satisfaction|evaluation|assessment|questionnaire|feedback/.test(type)) return "feedback";
  return "other";
}

/** @template {{ reminderType?: string | null }} T
 * @param {readonly T[]} followups
 */
export function countDailyFollowupCategories(followups) {
  const counts = { all: followups.length, attendance: 0, signature: 0, documents: 0, feedback: 0, other: 0 };
  for (const item of followups) counts[dailyFollowupCategory(item)]++;
  return counts;
}

/** @template {{ reminderType?: string | null }} T
 * @param {readonly T[]} followups
 * @param {unknown} rawCategory
 * @returns {T[]}
 */
export function filterDailyFollowupCategories(followups, rawCategory) {
  const category = normalizeDailyFollowupCategory(rawCategory);
  return category === "all" ? [...followups] : followups.filter(item => dailyFollowupCategory(item) === category);
}
