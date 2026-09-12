import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
const helper = await readFile(new URL("../src/lib/server/dailyPilotageVisibility.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/components/agent/AgentHomeDashboard.tsx", import.meta.url), "utf8");
const escalationPage = await readFile(new URL("../src/app/agent/daily/escalations/page.tsx", import.meta.url), "utf8");
const escalationRoute = await readFile(new URL("../src/app/agent/api/daily/escalations/route.ts", import.meta.url), "utf8");
const dossierLayout = await readFile(new URL("../src/app/agent/daily/session-dossiers/[id]/layout.tsx", import.meta.url), "utf8");

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
  assert.match(page, /canTreatDailyPilotageTask\(item, staff\)/);
  assert.match(page, /Traitement réservé à l’agent assigné/);
  assert.doesNotMatch(page, /24 h ouvrées · équipe/);
});

test("la visibilité transversale ne modifie aucune assignation", () => {
  assert.doesNotMatch(helper, /daily_organisation_assignments.*\.update|daily_organisation_assignments.*\.delete/s);
  assert.doesNotMatch(page, /daily_organisation_assignments.*\.update|daily_organisation_assignments.*\.delete/s);
});

test("une tâche peut être escaladée sans disparaître du Pilotage Daily", () => {
  assert.match(helper, /daily_work_escalations/);
  assert.match(helper, /\["open", "in_progress"\]/);
  assert.match(page, /Escaladé à un administrateur/);
  assert.match(page, /Escalader à un admin/);
  assert.match(page, /Traiter maintenant/);
  assert.match(escalationRoute, /canTreatDailyPilotageTask/);
});

test("le dossier complet expose une escalade motivée vers un admin", () => {
  assert.match(dossierLayout, /Escalader ce dossier à un admin/);
  assert.match(escalationPage, /Motif de l.escalade/);
  assert.match(escalationRoute, /daily_session_dossiers/);
});

test("l'admin peut prendre, retourner ou résoudre avec historique", () => {
  assert.match(escalationPage, /Prendre en charge/);
  assert.match(escalationPage, /Retourner à l.agent/);
  assert.match(escalationPage, /Résoudre/);
  assert.match(escalationRoute, /event_type/);
  assert.match(escalationRoute, /"taken" \| "returned" \| "resolved"/);
});
