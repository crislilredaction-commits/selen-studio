import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tasks = await readFile(new URL("../src/lib/server/dailyAgentTasks.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/components/agent/AgentHomeDashboard.tsx", import.meta.url), "utf8");
const registry = await readFile(new URL("../src/app/agent/dossiers/UnifiedDossiersPage.tsx", import.meta.url), "utf8");

test("les tâches Daily dérivent l’agent de l’organisme, jamais du dossier de session", () => {
  assert.match(tasks, /from\("daily_organisation_assignments"\)/);
  assert.match(tasks, /assignmentByOrg/);
  assert.match(tasks, /assignment\.agent_profile_id/);
  assert.doesNotMatch(tasks, /daily_session_dossiers/);
  assert.doesNotMatch(tasks, /assigned_agent_profile_id/);
});

test("le dashboard Daily consomme le moteur de tâches canonique et écarte les anciens dossiers Daily", () => {
  assert.match(dashboard, /getDailyAgentTasks/);
  assert.match(dashboard, /row\.type !== "daily"/);
  assert.match(dashboard, /\.neq\("type", "daily"\)/);
});

test("le registre transversal affiche l’assignation Daily issue de l’organisme", () => {
  assert.match(registry, /from\("daily_organisation_assignments"\)/);
  assert.match(registry, /dailyAgentByOrganisation/);
  assert.match(registry, /dossier\.type === "daily" && organisation/);
  assert.match(registry, /dailyAgentByOrganisation\.get\(organisation\.id\)/);
  assert.match(registry, /\/agent\/daily\/organisations\/\$\{organisation\.id\}/);
});

test("une tâche précise dépassant 72 h devient partageable sans réassigner l’organisme", () => {
  assert.match(tasks, /const SLA_MS = 72 \* 60 \* 60 \* 1000/);
  assert.match(tasks, /return task\.overdueShared/);
  assert.match(tasks, /Le dossier reste assigné à son agent, mais toute l'équipe peut maintenant la traiter/);
  assert.doesNotMatch(tasks, /upsert\([^)]*daily_organisation_assignments/s);
});
