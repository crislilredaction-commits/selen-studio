import { getDailyAgentTasks, type DailyAgentTask, type DailyTaskStaff } from "@/lib/server/dailyAgentTasks";

/**
 * Pilotage Daily est une vue transversale : elle doit voir toutes les tâches humaines
 * sans modifier leur assignation. L'agrégateur historique filtre pour le tableau de
 * bord personnel ; on l'utilise ici avec une visibilité admin uniquement pour obtenir
 * la collection complète, puis les droits d'action restent calculés avec le vrai staff.
 */
export async function getDailyPilotageTasks(): Promise<DailyAgentTask[]> {
  return getDailyAgentTasks({ id: null, role: "admin" });
}

export function canTreatDailyPilotageTask(task: DailyAgentTask, staff: DailyTaskStaff) {
  if (task.kind === "assignment") return true;
  if (staff.role === "admin") return true;
  if (!task.assignedAgentProfileId) return true;
  return task.assignedAgentProfileId === staff.id || task.overdueShared;
}
