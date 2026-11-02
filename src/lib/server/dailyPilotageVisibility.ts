import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getDailyAgentTasks, type DailyAgentTask, type DailyTaskStaff } from "@/lib/server/dailyAgentTasks";

export type DailyPilotageTask = DailyAgentTask & { escalatedToAdmin: boolean };

/**
 * Pilotage Daily est une vue transversale : elle doit voir toutes les tâches humaines
 * sans modifier leur assignation. Les escalades sont un état parallèle : elles rendent
 * visible qu'un admin est saisi sans retirer ni dupliquer la tâche métier d'origine.
 */
export async function getDailyPilotageTasks(): Promise<DailyPilotageTask[]> {
  const tasks = await getDailyAgentTasks({ id: null, role: "admin" }, { hideResolved: true });
  if (tasks.length === 0) return [];

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("daily_work_escalations")
    .select("organisation_id,task_key")
    .eq("target_type", "task")
    .in("status", ["open", "in_progress", "returned"])
    .in("organisation_id", [...new Set(tasks.map((task) => task.organisationId))])
    .in("task_key", tasks.map((task) => task.id));
  if (error) throw new Error(error.message);

  const activeKeys = new Set((data ?? []).map((row) => `${row.organisation_id}:${row.task_key}`));
  return tasks.map((task) => ({ ...task, escalatedToAdmin: activeKeys.has(`${task.organisationId}:${task.id}`) }));
}

export function canTreatDailyPilotageTask(task: DailyAgentTask, staff: DailyTaskStaff) {
  if (task.kind === "assignment") return true;
  if (staff.role === "admin") return true;
  if (!task.assignedAgentProfileId) return false;
  return task.assignedAgentProfileId === staff.id || task.overdueShared;
}
