import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tasks = await readFile(new URL("../src/lib/server/dailyAgentTasks.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../src/app/agent/daily/preaudit/[actionId]/page.tsx", import.meta.url), "utf8");
const checklist = await readFile(new URL("../src/lib/daily/qualiopiPreauditChecklist.ts", import.meta.url), "utf8");
const organisationLayout = await readFile(new URL("../src/app/agent/daily/organisations/[id]/layout.tsx", import.meta.url), "utf8");
const cyclePage = await readFile(new URL("../src/app/agent/daily/organisations/[id]/qualiopi-cycle/page.tsx", import.meta.url), "utf8");

test("le pré-audit utilise les actions qualité existantes et l'assignation organisme", () => {
  assert.match(tasks, /\.from\("daily_quality_actions"\)/);
  assert.match(tasks, /"qualiopi_preaudit"/);
  assert.match(tasks, /\.in\("status", \["open", "planned"\]\)/);
  assert.match(tasks, /const assignment = assignmentByOrg\.get\(action\.organisation_id\)/);
  assert.match(tasks, /if \(!organisation \|\| !assignment\) continue/);
});

test("la règle des 72 h partage la tâche sans changer l'assignation", () => {
  assert.match(tasks, /const SLA_MS = 72 \* 60 \* 60 \* 1000/);
  assert.match(tasks, /assignedAgentProfileId: assignment\.agent_profile_id/);
  assert.match(tasks, /overdueShared/);
  assert.doesNotMatch(page, /\.from\("daily_organisation_assignments"\)\s*\.update\(/);
});

test("le traitement répète le contrôle serveur puis fait disparaître la tâche", () => {
  assert.match(page, /assignment\?\.agent_profile_id === profile\.id \|\| isOverdue\(action\.created_at\)/);
  assert.match(page, /Cette tâche est encore réservée à l’agent assigné/);
  assert.match(page, /status: "implemented"/);
  assert.match(page, /implemented_at: new Date\(\)\.toISOString\(\)/);
  assert.match(page, /revalidatePath\("\/agent\/daily"\)/);
});

test("la checklist pré-audit consolidée reste extensible et centralisée", () => {
  assert.match(page, /QUALIOPI_PREAUDIT_CHECKLIST/);
  assert.match(page, /checklist reste extensible/i);
  for (const indicators of ["1", "2", "4 \/ 5", "6 \/ 10", "8", "9", "11", "12", "17", "18", "19", "21", "22", "23 \/ 24 \/ 25", "26", "27", "30", "31 \/ 32"]) {
    assert.match(checklist, new RegExp(`indicators: "${indicators}"`));
  }
  assert.match(checklist, /Pointer vers les preuves existantes plutôt que les dupliquer/);
});

test("Sélion est prévu comme pré-check non décisionnaire et l'agent garde la validation finale", () => {
  assert.match(checklist, /Sélion peut effectuer un premier pré-check automatique/);
  assert.match(checklist, /La validation finale du pré-audit reste sous la responsabilité de l’agent/);
  assert.match(checklist, /futur audit live/);
  assert.match(page, /réellement été réalisé et validé par un agent/);
});

test("Studio expose le cycle Qualiopi canonique en lecture seule", () => {
  assert.match(organisationLayout, /qualiopi-cycle/);
  assert.match(cyclePage, /requireSupportAgent\(\)/);
  assert.match(cyclePage, /\.from\("organisations"\)/);
  assert.match(cyclePage, /qualiopi_valid_from/);
  assert.match(cyclePage, /qualiopi_valid_until/);
  assert.match(cyclePage, /qualiopi_surveillance_window_start/);
  assert.match(cyclePage, /qualiopi_surveillance_window_end/);
  assert.match(cyclePage, /qualiopi_surveillance_audit_date/);
  assert.match(cyclePage, /qualiopi_renewal_reminder_on/);
  assert.doesNotMatch(cyclePage, /\.insert\(/);
  assert.doesNotMatch(cyclePage, /\.update\(/);
  assert.doesNotMatch(cyclePage, /\.delete\(/);
  assert.doesNotMatch(cyclePage, /\.upsert\(/);
});

test("Studio contrôle l'état du moteur de rappels Qualiopi existant sans le dupliquer", () => {
  assert.match(cyclePage, /\.from\("client_reminders"\)/);
  assert.match(cyclePage, /\.eq\("prestation_type", "daily_qualiopi"\)/);
  assert.match(cyclePage, /qualiopi_surveillance_window_open/);
  assert.match(cyclePage, /qualiopi_renewal_4_months/);
  assert.match(cyclePage, /qualiopi_certificate_expiry/);
  assert.match(cyclePage, /Échéance moteur/);
  assert.match(cyclePage, /Elle ne crée aucun rappel parallèle/);
});
