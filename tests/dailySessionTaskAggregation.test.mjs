import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const phases = await readFile(new URL("../src/lib/daily/sessionPhase.ts", import.meta.url), "utf8");
const tasks = await readFile(new URL("../src/lib/server/dailyAgentTasks.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/components/agent/AgentHomeDashboard.tsx", import.meta.url), "utf8");
const pilotage = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");

test("les phases de session sont cumulatives", () => {
  assert.match(phases, /phaseRank\[itemPhase\] <= phaseRank\[currentPhase\]/);
  assert.match(tasks, /isAvailablePhaseItem\(item\.phase, currentPhase\)/);
  assert.doesNotMatch(tasks, /item\.phase === currentPhase/);
});

test("la source commune agrège les tâches de session ouvertes attribuées à Selen", () => {
  assert.match(tasks, /from\("daily_session_checklist_items"\)/);
  assert.match(tasks, /\.in\("responsibility", \["selen", "shared"\]\)/);
  assert.match(tasks, /\.in\("status", \["todo", "in_progress", "to_review", "blocked"\]\)/);
  assert.match(tasks, /isAvailablePhaseItem\(item\.phase, currentPhase\)/);
  assert.match(tasks, /kind: "session"/);
});

test("dashboard et Pilotage Daily utilisent la même agrégation", () => {
  assert.match(dashboard, /getDailyAgentTasks/);
  assert.match(pilotage, /getDailyAgentTasks/);
});

test("un admin supervise immédiatement toutes les tâches, les agents conservent la règle des 72 h", () => {
  assert.match(tasks, /if \(staff\.role === "admin"\) return true/);
  assert.match(tasks, /if \(staff\.id === task\.assignedAgentProfileId\) return true/);
  assert.match(tasks, /return task\.overdueShared/);
});

test("une tâche terminée ne remonte plus et une tâche client n'est pas présentée comme tâche agent", () => {
  assert.doesNotMatch(tasks, /"validated"[^\n]*"not_applicable"[^\n]*daily_session_checklist_items/);
  assert.doesNotMatch(tasks, /\.in\("responsibility", \[[^\]]*"client"/);
});
