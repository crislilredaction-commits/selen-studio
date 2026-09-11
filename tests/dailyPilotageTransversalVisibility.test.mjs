import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
const helper = await readFile(new URL("../src/lib/server/dailyPilotageVisibility.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/components/agent/AgentHomeDashboard.tsx", import.meta.url), "utf8");

test("Pilotage Daily demande la collection transversale", () => {
  assert.match(page, /getDailyPilotageTasks\(\)/);
  assert.match(helper, /getDailyAgentTasks\(\{ id: null, role: "admin" \}\)/);
  assert.match(page, /Les actions qui nécessitent une intervention humaine sont regroupées ici, tous organismes confondus/);
});

test("le tableau de bord personnel conserve le filtre du vrai agent", () => {
  assert.match(dashboard, /getDailyAgentTasks\(\{ id: staff\.id, role: staff\.role \}\)/);
  assert.doesNotMatch(dashboard, /getDailyPilotageTasks/);
});

test("voir une tâche transversale ne donne pas automatiquement le droit de la traiter", () => {
  assert.match(helper, /task\.assignedAgentProfileId === staff\.id \|\| task\.overdueShared/);
  assert.match(page, /canTreatDailyPilotageTask\(item,staff\)/);
  assert.match(page, /Traitement réservé à l’agent assigné/);
  assert.doesNotMatch(page, /24 h ouvrées · équipe/);
});

test("la visibilité transversale ne modifie aucune assignation", () => {
  assert.doesNotMatch(helper, /\.update\(|\.insert\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(page, /daily_organisation_assignments.*\.update|daily_organisation_assignments.*\.delete/s);
});
