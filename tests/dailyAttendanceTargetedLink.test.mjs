import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isolatedTsModule } from "./helpers/isolatedTsModule.mjs";

const helper = isolatedTsModule("src/lib/daily/attendanceRegularizationLink.ts");
const page = await readFile(new URL("../src/app/agent/daily/session-dossiers/[id]/full/page.tsx", import.meta.url), "utf8");
const component = await readFile(new URL("../src/components/agent/AttendanceRegularizationLink.tsx", import.meta.url), "utf8");
const now = new Date("2026-10-15T18:00:00Z");
const access = { session_id: "session", portal_type: "learner", entity_key: "learner:learner", entity_email: "learner@example.test", token: "secret/token", status: "viewed", expires_at: "2026-10-20T00:00:00Z" };

test("le lien cible la clé stable du bon apprenant et encode le jeton et le créneau", () => {
  const resolved = helper.resolveLearnerAttendanceAccess({ accesses: [access], sessionId: "session", learnerId: "learner", learnerEmail: access.entity_email, now });
  assert.equal(resolved.token, "secret/token");
  assert.equal(helper.buildAttendanceRegularizationUrl("https://www.selen-editions.fr/", resolved, "slot/one"), "https://www.selen-editions.fr/daily/portail/learner/secret%2Ftoken/presence/slot%2Fone/rattrapage");
});

test("un accès révoqué, expiré ou rattaché à une autre session est refusé", () => {
  for (const candidate of [
    { ...access, status: "revoked" },
    { ...access, expires_at: null },
    { ...access, expires_at: "2026-10-15T17:00:00Z" },
    { ...access, session_id: "other" },
  ]) assert.equal(helper.resolveLearnerAttendanceAccess({ accesses: [candidate], sessionId: "session", learnerId: "learner", learnerEmail: access.entity_email, now }), null);
});

test("une clé stable étrangère ne peut pas être contournée par le même email", () => {
  assert.equal(helper.resolveLearnerAttendanceAccess({ accesses: [{ ...access, entity_key: "learner:other" }], sessionId: "session", learnerId: "learner", learnerEmail: access.entity_email, now }), null);
  assert.equal(helper.resolveLearnerAttendanceAccess({ accesses: [{ ...access, entity_key: null }], sessionId: "session", learnerId: "learner", learnerEmail: "LEARNER@example.test", now })?.token, access.token);
});

test("le modèle d’email cible le créneau et conserve explicitement l’horodatage réel", () => {
  const email = helper.buildAttendanceRegularizationEmail({ learnerName: "Alice Exemple", slotLabel: "12/10/2026 · 09:00 à 12:00", url: "https://example.test/personal", expiresAt: "2026-10-20T00:00:00Z" });
  assert.match(email.subject, /régulariser votre émargement/);
  assert.match(email.body, /Alice Exemple/);
  assert.match(email.body, /12\/10\/2026 · 09:00 à 12:00/);
  assert.match(email.body, /https:\/\/example\.test\/personal/);
  assert.match(email.body, /date et son heure réelles/);
  assert.match(email.body, /ne modifiera pas rétroactivement/);
  assert.equal(helper.buildAttendanceRegularizationEmail({ learnerName: "Alice", slotLabel: "créneau", url: null }), null);
});

test("Studio ne résout le jeton que dans le dossier authentifié et borné à la session", () => {
  assert.match(page, /isDailyOrganisationInAgentScope/);
  assert.match(page, /daily_portal_access_tokens/);
  assert.match(page, /\.eq\("session_id",id\)/);
  assert.match(page, /resolveLearnerAttendanceAccess/);
  assert.match(page, /phase==="closed"/);
  assert.match(component, /navigator\.clipboard\.writeText/);
  assert.match(component, /Copier l’email de relance/);
  assert.match(component, /Aucun email n’est envoyé automatiquement/);
  assert.match(component, /rel="noreferrer"/);
});

test("Studio suspend la relance pendant la validation et la rouvre après rejet", () => {
  assert.match(page, /lateReview/);
  assert.match(page, /reviewState==="awaiting_validation"/);
  assert.match(page, /return\[\]/);
  assert.match(page, /reviewState==="rejected"/);
  assert.match(page, /À resoumettre/);
  assert.match(page, /Motif du rejet/);
});
