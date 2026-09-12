import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getDailyAgentTasks, type DailyAgentTask, type DailyTaskStaff } from "@/lib/server/dailyAgentTasks";

export type DailyPilotageTask = DailyAgentTask & { escalatedToAdmin: boolean };

/**
 * Pilotage Daily est une vue transversale : elle doit voir toutes les tâches humaines
 * sans modifier leur assignation. Les escalades sont un état parallèle : elles rendent
 * visible qu'un admin est saisi sans retirer ni dupliquer la tâche métier d'origine.
 */
export async function getDailyPilotageTasks(): Promise<DailyPilotageTask[]> {
  const tasks = await getDailyAgentTasks({ id: null, role: "admin" });
  if (tasks.length === 0) return [];

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("daily_work_escalations")
    .select("task_key")
    .eq("target_type", "task")
    .in("status", ["open", "in_progress"])
    .in("task_key", tasks.map((task) => task.id));
  if (error) throw new Error(error.message);

  const activeKeys = new Set((data ?? []).map((row) => row.task_key).filter(Boolean));
  return tasks.map((task) => ({ ...task, escalatedToAdmin: activeKeys.has(task.id) }));
}

export function canTreatDailyPilotageTask(task: DailyAgentTask, staff: DailyTaskStaff) {
  if (task.kind === "assignment") return true;
  if (staff.role === "admin") return true;
  if (!task.assignedAgentProfileId) return true;
  return task.assignedAgentProfileId === staff.id || task.overdueShared;
}
