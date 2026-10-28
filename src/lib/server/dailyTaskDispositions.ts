import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { isCurrentDailyTaskDisposition } from "@/lib/daily/taskDispositionPolicy.mjs";
import type { DailyAgentTask } from "@/lib/server/dailyAgentTasks";

type Disposition = { organisation_id: string; task_key: string; fingerprint: string };
export async function withoutManuallyDisposedDailyTasks(tasks: DailyAgentTask[]): Promise<DailyAgentTask[]> {
  if (!tasks.length) return tasks;
  const admin = createSupabaseAdminClient();
  const organisationIds = [...new Set(tasks.map(task => task.organisationId))];
  const records: Disposition[] = [];
  for (let i = 0; i < tasks.length; i += 200) {
    const chunk = tasks.slice(i, i + 200);
    const { data, error } = await admin.from("daily_agent_task_dispositions")
      .select("organisation_id,task_key,fingerprint")
      .in("organisation_id", organisationIds)
      .in("task_key", chunk.map(task => task.id));
    if (error) throw new Error("Impossible de lire les décisions manuelles Daily : " + error.message);
    records.push(...((data ?? []) as Disposition[]));
  }
  const byKey = new Map(records.map(row => [row.organisation_id + ":" + row.task_key, row]));
  return tasks.filter(task => !isCurrentDailyTaskDisposition(
    byKey.get(task.organisationId + ":" + task.id), task));
}
