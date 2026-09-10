import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/lib/server/studioClientFollowups.ts", import.meta.url), "utf8");
const tasks = await readFile(new URL("../src/lib/server/dailyAgentTasks.ts", import.meta.url), "utf8");
const businessTime = await readFile(new URL("../src/lib/franceBusinessTime.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260909125000_daily_signature_client_reminders.sql", import.meta.url), "utf8");

// Cette garde est volontairement branchée au build pour valider le lot complet avant fusion.
test("la relance signature J+3 automatique reste cachée de Studio", () => {
  assert.match(source, /SIGNATURE_J3_STAGE = "automatic_email_j3"/);
  assert.match(source, /if \(stage === SIGNATURE_J3_STAGE\) return \[\]/);
});

test("l'alerte d'appel J+6 n'apparaît qu'à son échéance", () => {
  assert.match(source, /SIGNATURE_J6_STAGE = "phone_call_j6"/);
  assert.match(source, /if \(!isDue\(row\.due_at\)\) return \[\]/);
});

test("les 24 h ouvrées de l'alerte J+6 partent de J+6 et non de l'envoi initial", () => {
  assert.match(source, /followupStage\(row\) === SIGNATURE_J6_STAGE\) return row\.due_at/);
  assert.match(source, /AGENT_SHARED_AFTER_BUSINESS_HOURS = 24/);
  assert.match(source, /isOverdueAfterBusinessHours/);
});

test("la règle équipe passe à 24 h ouvrées sans réassignation", () => {
  assert.match(tasks, /AGENT_SHARED_AFTER_BUSINESS_HOURS = 24/);
  assert.match(tasks, /isOverdueAfterBusinessHours/);
  assert.match(page, /24 h ouvrées/);
  assert.doesNotMatch(page, />72 h · équipe</);
  assert.match(source, /assigned_agent_profile_id/);
  assert.match(source, /staff\.id === agentId \|\| overdueShared/);
  assert.doesNotMatch(source, /daily_organisation_assignments.*update|\.from\("daily_organisation_assignments"\).*\.update/s);
});

test("le calcul ouvré exclut week-ends et jours fériés français", () => {
  assert.match(businessTime, /weekday === "Sat" \|\| parts\.weekday === "Sun"/);
  assert.match(businessTime, /frenchPublicHolidayKeys/);
  assert.match(businessTime, /05-01/);
  assert.match(businessTime, /05-08/);
  assert.match(businessTime, /07-14/);
  assert.match(businessTime, /11-11/);
  assert.match(businessTime, /easterSunday/);
});

test("le schéma partagé autorise le rappel signature et sa clôture sans suppression", () => {
  assert.match(migration, /daily_signature_pending_72h/);
  assert.match(migration, /'resolved'/);
  assert.doesNotMatch(migration, /drop table|delete from|truncate/i);
});
