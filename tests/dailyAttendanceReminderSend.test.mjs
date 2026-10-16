import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../src/app/agent/api/daily/attendance-regularization/send/route.ts", import.meta.url), "utf8");
const canonical = await readFile(new URL("../src/lib/server/dailyAttendanceRegularizationReminder.ts", import.meta.url), "utf8");
const component = await readFile(new URL("../src/components/agent/AttendanceRegularizationLink.tsx", import.meta.url), "utf8");
const queue = await readFile(new URL("../src/lib/server/dailyAttendanceClientFollowups.ts", import.meta.url), "utf8");

test("l’envoi exige habilitation et double confirmation humaine", () => {
  assert.match(route, /requireSupportAgent/);
  assert.match(route, /confirmedRecipient !== true \|\| body\.confirmedSend !== true/);
  assert.match(component, /window\.confirm/);
  assert.match(component, /confirmedSend: true/);
});

test("les gardes canoniques sont partagées puis revérifiées juste avant transport", () => {
  assert.equal(route.match(/prepareAttendanceRegularizationReminder/g)?.length, 3);
  assert.match(route, /rechecked\.cycle !== prepared\.cycle/);
  for (const table of ["daily_sessions", "daily_session_enrolments", "daily_attendance_slots", "daily_attendance_records", "daily_portal_access_tokens"]) assert.match(canonical, new RegExp(table));
  assert.match(canonical, /awaiting_validation/);
});

test("la preuve complète est réservée avant le transport et sans jeton dans les métadonnées", () => {
  const evidenceAt = route.indexOf('.from("daily_communications").insert(evidence)');
  const sendAt = route.indexOf("sendClientEmailWithSilence({");
  assert.ok(evidenceAt > 0 && sendAt > evidenceAt);
  assert.match(route, /text_body: prepared\.email\.body/);
  assert.match(route, /html_body: emailHtml\(prepared\.email\.body\)/);
  const metadata = route.match(/metadata: \{[^}]+\}/s)?.[0] ?? "";
  assert.doesNotMatch(metadata, /url|token/);
});

test("l’envoi est idempotent par cycle et un échec seul peut être repris", () => {
  assert.match(route, /deterministicAttendanceFollowupId/);
  assert.match(route, /\["sent", "delivered"\]/);
  assert.match(route, /existing\.status === "queued"/);
  assert.match(route, /\.eq\("status", "failed"\)/);
  assert.match(route, /review_cycle: prepared\.cycle/);
});

test("silence client, erreurs et succès conservent un état explicite", () => {
  assert.match(route, /delivery\.paused/);
  assert.match(route, /status: "failed"/);
  assert.match(route, /status: "sent"/);
  assert.match(route, /provider_message_id/);
  assert.match(route, /Ne pas renvoyer avant vérification manuelle/);
});

test("la file Clients à relancer consomme les suivis réels et le cycle de rejet", () => {
  assert.match(queue, /attendance_regularization_followup/);
  assert.match(queue, /review_cycle/);
  assert.match(queue, /rejected:v/);
  assert.match(queue, /#attendance-/);
});
