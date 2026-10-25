/**
 * Ordonne les tâches du pilotage agent sans changer leur attribution, leur statut
 * ni leur ordre d'origine lorsque les priorités et échéances sont identiques.
 *
 * @template {{ priority: "urgent" | "high" | "normal", dueAt: string | null }} T
 * @param {readonly T[]} tasks
 * @returns {T[]}
 */
export function prioritizeDailyPilotageTasks(tasks) {
  const rank = { urgent: 0, high: 1, normal: 2 };
  const date = (value) => {
    const timestamp = value ? Date.parse(value) : Number.NaN;
    return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
  };
  return tasks.map((task, index) => ({ task, index })).sort((a, b) =>
    rank[a.task.priority] - rank[b.task.priority] ||
    date(a.task.dueAt) - date(b.task.dueAt) ||
    a.index - b.index
  ).map(({ task }) => task);
}
