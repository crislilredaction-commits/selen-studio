import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dailyTaskFingerprint, isCurrentDailyTaskDisposition, canManuallyDisposeDailyTask } from "../src/lib/daily/taskDispositionPolicy.mjs";

const task = { id: "daily-session-checklist-11111111-1111-1111-1111-111111111111", organisationId: "22222222-2222-2222-2222-222222222222",
  status: "to_review", createdAt: "2026-10-28T08:00:00Z", dueAt: null, reason: "À traiter", detail: "Document à relire",
  expectedAction: "Relire", kind: "session" };
test("same canonical task and organisation stay dismissed across reloads", () => {
  const row = { organisation_id: task.organisationId, task_key: task.id, fingerprint: dailyTaskFingerprint(task) };
  assert.equal(isCurrentDailyTaskDisposition(row, task), true);
  assert.equal(isCurrentDailyTaskDisposition(row, { ...task, organisationId: "33333333-3333-3333-3333-333333333333" }), false);
});
test("changed status, details or source timestamp reopens generated tasks", () => {
  const row = { organisation_id: task.organisationId, task_key: task.id, fingerprint: dailyTaskFingerprint(task) };
  for (const changed of [{ status: "blocked" }, { detail: "Nouvelle pièce reçue" }, { createdAt: "2026-10-29T08:00:00Z" }]) {
    assert.equal(isCurrentDailyTaskDisposition(row, { ...task, ...changed }), false);
  }
});
test("assignment and blocked tasks cannot be hidden by manual disposition", () => {
  assert.equal(canManuallyDisposeDailyTask({ ...task, kind: "assignment" }), false);
  assert.equal(canManuallyDisposeDailyTask({ ...task, status: "blocked" }), false);
  assert.equal(canManuallyDisposeDailyTask(task), true);
});
test("both Studio dashboards use the same persisted disposition source", () => {
  const server = readFileSync("src/lib/server/dailyAgentTasks.ts", "utf8");
  const home = readFileSync("src/components/agent/AgentHomeDashboard.tsx", "utf8");
  const daily = readFileSync("src/lib/server/dailyPilotageVisibility.ts", "utf8");
  const route = readFileSync("src/app/agent/api/daily/task-disposition/route.ts", "utf8");
  assert.match(server, /withoutManuallyDisposedDailyTasks/);
  assert.match(home, /hideResolved: true/);
  assert.match(daily, /hideResolved: true/);
  assert.match(route, /canTreatDailyPilotageTask\(task, staff\)/);
  assert.match(route, /dailyTaskFingerprint\(task\) !== fingerprint/);
  assert.match(route, /daily_work_escalations/);
});
test("SQL keeps a trace and never changes regulatory source tables", () => {
  const sql = readFileSync("supabase/migrations/20261028104000_daily_agent_task_dispositions.sql", "utf8");
  assert.match(sql, /after insert or update/i);
  assert.match(sql, /enable row level security/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.daily_/i);
  assert.doesNotMatch(sql, /update\s+public\.daily_session_checklist_items/i);
});
