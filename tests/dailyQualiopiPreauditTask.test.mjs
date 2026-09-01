import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tasks = await readFile(new URL("../src/lib/server/dailyAgentTasks.ts", import.meta.url), "utf8");

test("le pré-audit Qualiopi reste hors du périmètre des tâches Daily", () => {
  assert.doesNotMatch(tasks, /qualiopi_preaudit/);
  assert.doesNotMatch(tasks, /daily-preaudit/);
  assert.doesNotMatch(tasks, /kind:\s*"preaudit"/);
  assert.doesNotMatch(tasks, /\/agent\/daily\/preaudit\//);
});

test("les actions qualité Daily conservent uniquement la relance satisfaction", () => {
  assert.match(tasks, /\.from\("daily_quality_actions"\)/);
  assert.match(tasks, /\.eq\("source_type", "satisfaction_phone_followup"\)/);
  assert.match(tasks, /\.in\("status", \["open", "planned"\]\)/);
  assert.match(tasks, /id: `daily-satisfaction-\$\{action\.id\}`/);
  assert.match(tasks, /kind: "satisfaction"/);
});

test("la règle des 72 h reste appliquée sans changer l'assignation organisme", () => {
  assert.match(tasks, /const SLA_MS = 72 \* 60 \* 60 \* 1000/);
  assert.match(tasks, /assignedAgentProfileId: assignment\.agent_profile_id/);
  assert.match(tasks, /overdueShared/);
});
