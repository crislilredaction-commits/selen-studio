/** Lecture seule : étape métier d'une tâche déjà autorisée au pilotage. */
export const DAILY_PILOTAGE_PHASES = ["all", "before", "during", "after", "global"];

/** @param {unknown} value */
export function normalizeDailyPilotagePhase(value) {
  return typeof value === "string" && DAILY_PILOTAGE_PHASES.includes(value) ? value : "all";
}

/** @param {{ kind?: string, workflowPhase?: string }} task */
export function getDailyPilotageTaskPhase(task) {
  if (task.kind === "session") {
    return ["before", "during", "after"].includes(task.workflowPhase) ? task.workflowPhase : "global";
  }
  if (["program", "registration", "adaptation"].includes(task.kind)) return "before";
  if (task.kind === "satisfaction") return "after";
  return "global";
}

/**
 * Ne change jamais les attributions ni les droits. Le filtrage s'applique
 * uniquement aux tâches déjà retournées par le serveur.
 * @template {{ kind?: string, workflowPhase?: string }} T
 * @param {readonly T[]} tasks
 * @param {unknown} phase
 * @returns {T[]}
 */
export function filterDailyPilotageTaskPhase(tasks, phase) {
  const selected = normalizeDailyPilotagePhase(phase);
  return selected === "all" ? [...tasks] : tasks.filter(task => getDailyPilotageTaskPhase(task) === selected);
}

/** @template {{ kind?: string, workflowPhase?: string }} T
 *  @param {readonly T[]} tasks
 */
export function countDailyPilotageTaskPhases(tasks) {
  const counts = { all: tasks.length, before: 0, during: 0, after: 0, global: 0 };
  for (const task of tasks) counts[getDailyPilotageTaskPhase(task)]++;
  return counts;
}
