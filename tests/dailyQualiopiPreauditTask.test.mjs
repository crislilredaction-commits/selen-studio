import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tasks = await readFile(new URL("../src/lib/server/dailyAgentTasks.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../src/app/agent/daily/preaudit/[actionId]/page.tsx", import.meta.url), "utf8");
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

test("la checklist pré-audit reste explicitement extensible", () => {
  assert.match(page, /checklist détaillée reste extensible/i);
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
