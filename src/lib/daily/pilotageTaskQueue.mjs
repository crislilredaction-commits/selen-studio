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

/**
 * Paginer une file déjà filtrée et triée, sans nouvel accès aux données ni
 * changement d'attribution. Les paramètres URL multiples ou invalides sont ignorés.
 * @template T
 * @param {readonly T[]} tasks
 * @param {unknown} rawPage
 * @param {number} [pageSize]
 */
export function paginateDailyPilotageTasks(tasks, rawPage, pageSize = 20) {
  const size = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : 20;
  const total = tasks.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const validPage = typeof rawPage === "string" && /^[1-9]\d{0,5}$/.test(rawPage);
  const requested = validPage ? Number(rawPage) : 1;
  const page = Math.min(requested, totalPages);
  const start = (page - 1) * size;
  const items = tasks.slice(start, start + size);
  return { items, page, totalPages, total, from: total ? start + 1 : 0, to: start + items.length };
}
