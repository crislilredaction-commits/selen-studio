import { createHash } from "node:crypto";

export function dailyTaskFingerprint(task) {
  const source = [task.id, task.organisationId, task.status, task.createdAt,
    task.dueAt, task.reason, task.detail, task.expectedAction];
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
