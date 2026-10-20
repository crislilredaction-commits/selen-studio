import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isolatedTsModule } from "./helpers/isolatedTsModule.mjs";

const queue = await readFile(new URL("../src/lib/server/dailyAttendanceRegularizations.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/components/agent/AgentHomeDashboard.tsx", import.meta.url), "utf8");
const statusRules = isolatedTsModule("src/lib/server/dailyAttendanceRegularizations.ts", {
  "@/lib/server/supabaseAdmin": { createSupabaseAdminClient: () => ({}) },
  "@/lib/server/dailyOrganisationScope": { getActiveDailyOrganisationIds: async () => [] },
});

test("la file agrège les créneaux et émargements depuis les sources Daily canoniques", () => {
  assert.match(queue, /daily_attendance_slots/);
  assert.match(queue, /daily_session_enrolments/);
  assert.match(queue, /daily_attendance_records/);
  assert.match(queue, /slotHasEnded/);
});

test("la file reste dans le périmètre Daily actif et l'affectation Studio", () => {
  assert.match(queue, /getActiveDailyOrganisationIds/);
  assert.match(queue, /daily_organisation_assignments/);
  assert.match(queue, /row\.agent_profile_id === staff\.id/);
});

test("les inscriptions inactives et présences déjà qualifiées ne sont pas à régulariser", () => {
  for (const status of ["declined", "cancelled", "canceled", "abandoned"]) assert.match(queue, new RegExp(`\\"${status}\\"`));
  for (const status of ["present", "absent", "excused"]) assert.match(queue, new RegExp(`\\"${status}\\"`));
});

test("les variantes historiques de désinscription sont normalisées avant la file", () => {
  for (const status of [" cancelled ", "CANCELED", "\tDeclined\n", " AbAnDoNeD "])
    assert.equal(statusRules.isDailyAttendanceRegularizationEnrolmentActive(status), false);
  for (const status of ["completed", " pending ", null])
    assert.equal(statusRules.isDailyAttendanceRegularizationEnrolmentActive(status), true);
});

test("les présences résolues sont reconnues malgré la casse et les espaces", () => {
  for (const status of [" PRESENT ", "Absent", "\texcused\n"])
    assert.equal(statusRules.isDailyAttendanceRegularizationResolved(status), true);
  assert.equal(statusRules.isDailyAttendanceRegularizationResolved("pending"), false);
});

test("les sessions closes sont normalisées avant de créer une régularisation", () => {
  for (const status of [" CANCELLED ", "canceled", "Deleted", " removed\t"])
    assert.equal(statusRules.isDailyAttendanceRegularizationSessionInactive(status), true);
  assert.equal(statusRules.isDailyAttendanceRegularizationSessionInactive("completed"), false);
});

test("une session annulée ou supprimée ne crée jamais de régularisation", () => {
  for (const status of ["cancelled", "canceled", "deleted", "removed"]) assert.match(queue, new RegExp(`\\"${status}\\"`));
  assert.match(queue, /INACTIVE_SESSION_STATUSES\.has/);
});

test("le tableau de bord ouvre le détail authentifié sans exposer de jeton ni preuve technique", () => {
  assert.match(dashboard, /En attente de régularisation/);
  assert.match(queue, /\/agent\/daily\/session-dossiers\/\$\{encodeURIComponent\(slot\.session_id\)\}\/full/);
  assert.doesNotMatch(queue, /daily_portal_access_tokens|signature_storage_path|ip_address|user_agent/);
});

test("la file Studio reflète le cycle de revue conservé par Daily", () => {
  assert.match(queue, /evidence_metadata/);
  assert.match(queue, /late_review/);
  assert.match(queue, /awaiting_validation/);
  assert.match(queue, /rejected/);
  assert.match(queue, /resoumission requise/);
});
