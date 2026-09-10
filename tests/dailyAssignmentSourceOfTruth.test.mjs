import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tasks = await readFile(new URL("../src/lib/server/dailyAgentTasks.ts", import.meta.url), "utf8");
const pilotage = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/components/agent/AgentHomeDashboard.tsx", import.meta.url), "utf8");
const registry = await readFile(new URL("../src/app/agent/dossiers/UnifiedDossiersPage.tsx", import.meta.url), "utf8");
const legacyTasksPage = await readFile(new URL("../src/app/agent/daily/session-dossiers/page.tsx", import.meta.url), "utf8");
const businessTime = await readFile(new URL("../src/lib/franceBusinessTime.ts", import.meta.url), "utf8");
const sessionNotificationAssignment = await readFile(
  new URL("../supabase/migrations/20260905084500_daily_session_notifications_use_org_assignment.sql", import.meta.url),
  "utf8",
);

test("les tâches Daily dérivent l’agent de l’organisme, jamais du dossier de session", () => {
  assert.match(tasks, /from\("daily_organisation_assignments"\)/);
  assert.match(tasks, /assignmentByOrg/);
  assert.match(tasks, /assignment\.agent_profile_id/);
  assert.doesNotMatch(tasks, /daily_session_dossiers/);
  assert.doesNotMatch(tasks, /assigned_agent_profile_id/);
});

test("le dashboard Daily consomme le moteur de tâches canonique et écarte les faux doublons de messagerie", () => {
  assert.match(dashboard, /getDailyAgentTasks/);
  assert.match(dashboard, /assigned = \(\(data \?\? \[\]\) as DossierRow\[\]\)\.filter\(\(row\) => active\(row\.status\) && row\.type !== "daily"\)/);
  assert.doesNotMatch(dashboard, /unreadDossiers/);
  assert.match(dashboard, /\.neq\("type", "daily"\)/);
});

test("le registre transversal affiche l’assignation Daily issue de l’organisme", () => {
  assert.match(registry, /from\("daily_organisation_assignments"\)/);
  assert.match(registry, /dailyAgentByOrganisation/);
  assert.match(registry, /dossier\.type === "daily" && organisation/);
  assert.match(registry, /dailyAgentByOrganisation\.get\(organisation\.id\)/);
  assert.match(registry, /\/agent\/daily\/organisations\/\$\{organisation\.id\}/);
});

test("l’ancienne page Tâches agent délègue au Pilotage Daily canonique", () => {
  assert.match(legacyTasksPage, /redirect\("\/agent\/daily"\)/);
  assert.doesNotMatch(legacyTasksPage, /daily_session_dossiers/);
  assert.doesNotMatch(legacyTasksPage, /assigned_agent_profile_id/);
  assert.doesNotMatch(legacyTasksPage, /daily_session_checklist_items/);
});

test("une tâche précise dépassant 24 h ouvrées devient partageable sans réassigner l’organisme ni surcharger Pilotage", () => {
  assert.match(tasks, /AGENT_SHARED_AFTER_BUSINESS_HOURS = 24/);
  assert.match(tasks, /isOverdueAfterBusinessHours/);
  assert.match(businessTime, /weekday === "Sat" \|\| parts\.weekday === "Sun"/);
  assert.match(businessTime, /frenchPublicHolidayKeys/);
  assert.match(tasks, /return task\.overdueShared/);
  assert.doesNotMatch(tasks, /Cette tâche dépasse 24 h ouvrées/);
  assert.doesNotMatch(pilotage, /24 h ouvrées · équipe/);
  assert.doesNotMatch(tasks, /upsert\([^)]*daily_organisation_assignments/s);
});

test("les notifications de checklist session ciblent l’assignation canonique de l’organisme", () => {
  assert.match(sessionNotificationAssignment, /from public\.daily_organisation_assignments a/);
  assert.match(sessionNotificationAssignment, /where a\.organisation_id = item\.organisation_id/);
  assert.match(sessionNotificationAssignment, /target_agent_profile_id/);
  assert.match(sessionNotificationAssignment, /assignment_agent_id/);
  assert.doesNotMatch(sessionNotificationAssignment, /dossier\.assigned_agent_profile_id/);
});

test("une réassignation d’organisme resynchronise aussi les notifications des sessions", () => {
  assert.match(sessionNotificationAssignment, /from public\.daily_session_checklist_items/);
  assert.match(sessionNotificationAssignment, /where organisation_id = organisation_id_value/);
  assert.match(sessionNotificationAssignment, /daily_sync_session_checklist_notification\(checklist_id\)/);
});
