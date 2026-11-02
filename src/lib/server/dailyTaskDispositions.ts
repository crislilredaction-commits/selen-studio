import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { filterManuallyDisposedDailyTasks } from "@/lib/daily/taskDispositionPolicy.mjs";
import type { DailyAgentTask } from "@/lib/server/dailyAgentTasks";

type Disposition = { organisation_id: string; task_key: string; fingerprint: string };
type Escalation = { organisation_id: string; task_key: string };
export async function withoutManuallyDisposedDailyTasks(tasks: DailyAgentTask[]): Promise<DailyAgentTask[]> {
  if (!tasks.length) return tasks;
  const admin = createSupabaseAdminClient();
  const records: Disposition[] = [];
  const escalations: Escalation[] = [];
  for (let i = 0; i < tasks.length; i += 200) {
    const chunk = tasks.slice(i, i + 200);
    const organisationIds = [...new Set(chunk.map(task => task.organisationId))];
    const taskKeys = chunk.map(task => task.id);
    const [dispositionsResult, escalationsResult] = await Promise.all([
      admin.from("daily_agent_task_dispositions")
        .select("organisation_id,task_key,fingerprint")
        .in("organisation_id", organisationIds)
        .in("task_key", taskKeys),
      admin.from("daily_work_escalations")
        .select("organisation_id,task_key")
        .eq("target_type", "task")
        .in("status", ["open", "in_progress", "returned"])
        .in("organisation_id", organisationIds)
        .in("task_key", taskKeys),
    ]);
    if (dispositionsResult.error || escalationsResult.error) {
      throw new Error("Impossible de vérifier les décisions manuelles et escalades Daily.");
    }
    records.push(...((dispositionsResult.data ?? []) as Disposition[]));
    escalations.push(...((escalationsResult.data ?? []) as Escalation[]));
  }
  return filterManuallyDisposedDailyTasks(tasks, records, escalations);
}
