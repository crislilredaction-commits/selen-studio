import { createHash } from "node:crypto";

export function dailyTaskFingerprint(task) {
  const source = [task.id, task.organisationId, task.status, task.createdAt,
    task.dueAt, task.reason, task.detail, task.expectedAction,
    task.title, task.href, task.context, task.workflowPhase,
    task.assignedAgentProfileId, task.overdueShared, task.priority];
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

export function isCurrentDailyTaskDisposition(disposition, task) {
  return Boolean(disposition && disposition.organisation_id === task.organisationId
    && disposition.task_key === task.id
    && disposition.fingerprint === dailyTaskFingerprint(task));
}

export function canManuallyDisposeDailyTask(task) {
  return task.kind !== "assignment" && task.status !== "blocked";
}

/** An active escalation always restores the task, even after a prior manual dismissal. */
export function filterManuallyDisposedDailyTasks(tasks, dispositions, escalations) {
  const keyOf = (organisationId, taskKey) => `${organisationId}:${taskKey}`;
  const byKey = new Map(dispositions.map(row => [keyOf(row.organisation_id, row.task_key), row]));
  const escalated = new Set(escalations.map(row => keyOf(row.organisation_id, row.task_key)));
  return tasks.filter(task => {
    const key = keyOf(task.organisationId, task.id);
    return escalated.has(key) || !isCurrentDailyTaskDisposition(byKey.get(key), task);
  });
}
