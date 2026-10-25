/** Filtres de lecture du pilotage agent : aucune modification des tâches ni des droits. */
export const DAILY_PILOTAGE_VIEWS = ["all", "urgent", "overdue", "actionable"];

/** @param {unknown} value */
export function normalizeDailyPilotageView(value) {
  return typeof value === "string" && DAILY_PILOTAGE_VIEWS.includes(value) ? value : "all";
}

/** @param {{ dueAt?: string | null }} task
 *  @param {Date} now
 */
export function isOverdueDailyPilotageTask(task, now = new Date()) {
  const due = task.dueAt ? Date.parse(task.dueAt) : Number.NaN;
  return Number.isFinite(due) && due < now.getTime();
}

/**
 * @template {{ priority: string, dueAt?: string | null }} T
 * @param {readonly T[]} tasks
 * @param {string} view
 * @param {{ now?: Date, canTreat?: (task: T) => boolean }} options
 * @returns {T[]}
 */
export function filterDailyPilotageTasks(tasks, view, options = {}) {
  const now = options.now ?? new Date();
  const canTreat = options.canTreat ?? (() => false);
  switch (normalizeDailyPilotageView(view)) {
    case "urgent": return tasks.filter(task => task.priority === "urgent");
    case "overdue": return tasks.filter(task => isOverdueDailyPilotageTask(task, now));
    case "actionable": return tasks.filter(task => canTreat(task));
    default: return [...tasks];
  }
}

/**
 * @template {{ priority: string, dueAt?: string | null }} T
 * @param {readonly T[]} tasks
 * @param {{ now?: Date, canTreat?: (task: T) => boolean }} options
 */
export function countDailyPilotageViews(tasks, options = {}) {
  return {
    all: tasks.length,
    urgent: filterDailyPilotageTasks(tasks, "urgent", options).length,
    overdue: filterDailyPilotageTasks(tasks, "overdue", options).length,
    actionable: filterDailyPilotageTasks(tasks, "actionable", options).length,
  };
}
