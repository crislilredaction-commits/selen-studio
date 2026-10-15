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

test("Studio ne résout le jeton que dans le dossier authentifié et borné à la session", () => {
  assert.match(page, /isDailyOrganisationInAgentScope/);
  assert.match(page, /daily_portal_access_tokens/);
  assert.match(page, /\.eq\("session_id",id\)/);
  assert.match(page, /resolveLearnerAttendanceAccess/);
  assert.match(page, /phase==="closed"/);
  assert.match(component, /navigator\.clipboard\.writeText/);
  assert.match(component, /rel="noreferrer"/);
});
