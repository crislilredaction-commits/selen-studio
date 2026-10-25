/**
 * Place les relances immédiatement dues sans date en tête, puis les échéances
 * valides de la plus ancienne à la plus récente. Les dates invalides restent
 * à la fin pour ne pas masquer les relances réellement échues.
 * L'ordre initial est conservé à échéance égale, sans modifier les objets.
 * @template {{ dueAt?: string | null }} T
 * @param {readonly T[]} followups
 * @returns {T[]}
 */
export function prioritizeStudioClientFollowups(followups) {
  const dueTime = (value) => {
    if (value == null || value === "") return Number.NEGATIVE_INFINITY;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
  };
  return followups.map((item, index) => ({ item, index })).sort((left, right) =>
    dueTime(left.item.dueAt) - dueTime(right.item.dueAt) || left.index - right.index
  ).map(({ item }) => item);
}
