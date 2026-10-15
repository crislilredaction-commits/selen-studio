import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../src/app/agent/api/daily/attendance-regularization/simulate/route.ts", import.meta.url), "utf8");
const component = await readFile(new URL("../src/components/agent/AttendanceRegularizationLink.tsx", import.meta.url), "utf8");
const auth = await readFile(new URL("../src/app/agent/api/support/_utils.ts", import.meta.url), "utf8");

test("la simulation exige un acteur habilité, son périmètre et une confirmation explicite", () => {
  assert.match(route, /requireSupportAgent/);
  assert.match(route, /isDailyOrganisationInAgentScope/);
  assert.match(route, /confirmedRecipient !== true/);
  assert.match(route, /recipientEmail !== canonicalEmail/);
  assert.match(route, /Le destinataire ne correspond plus à l’apprenant inscrit/);
  assert.match(auth, /actorType: "selen_admin"/);
  assert.match(auth, /actorType: "selen_operator"/);
});

test("l’état canonique est revérifié au moment de simuler", () => {
  for (const guard of ["daily_sessions", "daily_session_enrolments", "daily_attendance_slots", "daily_attendance_records", "daily_portal_access_tokens", "resolveLearnerAttendanceAccess"]) assert.match(route, new RegExp(guard));
  assert.match(route, /CLOSED_ENROLMENT_STATUSES/);
  assert.match(route, /QUALIFIED_ATTENDANCE_STATUSES/);
  assert.match(route, /slotHasEnded/);
  assert.match(route, /\.eq\("slot_id", slotId\)/);
});

test("la simulation est idempotente, auditée et n’appelle aucun transport email", () => {
  assert.match(route, /createHash\("sha256"\)/);
  assert.match(route, /daily_audit_logs/);
  assert.match(route, /attendance_regularization_reminder_simulated/);
  assert.match(route, /transport: "simulation"/);
  assert.match(route, /delivery_attempted: false/);
  assert.match(route, /auditError\.code !== "23505"/);
  assert.doesNotMatch(route, /sendSelenEmail|sendClientEmailWithSilence|resend\.emails/);
});

test("l’interface nomme clairement la simulation et invalide la confirmation si l’adresse change", () => {
  assert.match(component, /Destinataire de la simulation/);
  assert.match(component, /setConfirmedRecipient\(false\)/);
  assert.match(component, /Simuler l’envoi \(aucun email\)/);
  assert.match(component, /Cette simulation était déjà journalisée/);
});
