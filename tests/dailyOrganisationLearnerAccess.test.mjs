import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  findDailyLearnerPortalAccess,
  isClosedDailyEnrolment,
} from "../src/lib/daily/portalLearnerAccess.ts";

const page = readFileSync(
  new URL("../src/app/agent/daily/organisations/[id]/page.tsx", import.meta.url),
  "utf8",
);

const enrolment = (learnerId, status = "confirmed") => ({
  session_id: "session",
  learner_id: learnerId,
  status,
});
const learner = (id, email = "shared@example.test") => ({ id, email });

test("une clé canonique ne retombe jamais sur l’email partagé d’un autre apprenant", () => {
  const accesses = [{
    id: "cancelled-access",
    session_id: "session",
    portal_type: "learner",
    entity_key: "learner:cancelled",
    entity_email: "shared@example.test",
  }];

  assert.equal(findDailyLearnerPortalAccess(accesses, enrolment("active"), learner("active")), undefined);
  assert.equal(findDailyLearnerPortalAccess(accesses, enrolment("cancelled"), learner("cancelled"))?.id, "cancelled-access");
});

test("un ancien accès sans clé conserve son repli email normalisé", () => {
  const accesses = [{
    id: "legacy-access",
    session_id: "session",
    portal_type: "learner",
    entity_key: null,
    entity_email: " Shared@Example.Test ",
  }];

  assert.equal(findDailyLearnerPortalAccess(accesses, enrolment("legacy"), learner("legacy"))?.id, "legacy-access");
  assert.equal(findDailyLearnerPortalAccess(accesses, enrolment("other"), learner("other", "other@example.test")), undefined);
});

test("un accès historique dont la clé est l’email reste rattaché sans ouvrir le repli canonique", () => {
  const accesses = [{
    id: "email-keyed-access",
    session_id: "session",
    portal_type: "learner",
    entity_key: "shared@example.test",
    entity_email: " Shared@Example.Test ",
  }];

  assert.equal(findDailyLearnerPortalAccess(accesses, enrolment("legacy"), learner("legacy"))?.id, "email-keyed-access");
  assert.equal(findDailyLearnerPortalAccess(
    [{ ...accesses[0], entity_key: "learner:cancelled" }],
    enrolment("active"),
    learner("active"),
  ), undefined);
});

test("le repli email exige l’identité de l’apprenant de l’inscription", () => {
  const accesses = [{
    id: "legacy-access",
    session_id: "session",
    portal_type: "learner",
    entity_key: null,
    entity_email: "shared@example.test",
  }];

  assert.equal(findDailyLearnerPortalAccess(accesses, enrolment("expected"), learner("other")), undefined);
});

test("les désinscriptions sont closes sans assimiler une fin de formation à une annulation", () => {
  for (const status of ["declined", "cancelled", "abandoned"]) assert.equal(isClosedDailyEnrolment(status), true);
  for (const status of ["invited", "pending", "confirmed", "completed"]) assert.equal(isClosedDailyEnrolment(status), false);
});

test("Studio affiche le compteur actif, conserve l’historique et masque les actions closes", () => {
  assert.match(page, /openEnrolmentCount/);
  assert.match(page, /closedEnrolmentCount/);
  assert.match(page, /close\(s\) conservée\(s\)/);
  assert.match(page, /access && !closed \? <form action=\{openPortalAssistanceMode\}/);
  assert.match(page, /access && !closed && learner\.email \? <form action=\{resendPortalAccess\}/);
});
