import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tasks = await readFile(new URL("../src/lib/server/dailyAgentTasks.ts", import.meta.url), "utf8");

test("les relances téléphoniques satisfaction utilisent les actions qualité existantes", () => {
  assert.match(tasks, /"satisfaction_phone_followup"/);
  assert.match(tasks, /kind: satisfaction \? "satisfaction" : "preaudit"/);
  assert.match(tasks, /Relance satisfaction à effectuer/);
});

test("l'assignation reste celle de l'organisme avec partage après 72 h", () => {
  assert.match(tasks, /const assignment = assignmentByOrg\.get\(action\.organisation_id\)/);
  assert.match(tasks, /assignedAgentProfileId: assignment\.agent_profile_id/);
  assert.match(tasks, /const SLA_MS = 72 \* 60 \* 60 \* 1000/);
  assert.match(tasks, /overdueShared = isOverdue\(createdAt\)/);
});

test("une action satisfaction fermée disparaît du Pilotage", () => {
  assert.match(tasks, /\.in\("status", \["open", "planned"\]\)/);
});
