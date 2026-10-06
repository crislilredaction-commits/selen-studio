import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const list = read("src/app/agent/daily/learners/page.tsx");
const session = read("src/app/agent/daily/session-dossiers/[id]/page.tsx");
const learner = read("src/app/agent/daily/learners/[id]/page.tsx");

test("A9: la liste Studio respecte le périmètre réel de l'agent", () => {
  assert.match(list, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.doesNotMatch(list, /getActiveDailyOrganisationIds/);
  assert.match(list, /Ouvrir la fiche apprenant/);
});

test("A9: la page session affiche uniquement ses inscrits cohérents", () => {
  assert.match(session, /daily_sessions[\s\S]*\.in\("organisation_id", organisationIds\)/);
  assert.match(session, /daily_session_enrolments[\s\S]*\.eq\("organisation_id", session\.organisation_id\)[\s\S]*\.eq\("session_id", id\)/);
  assert.match(session, /learner\?\.organisation_id === session\.organisation_id/);
  assert.match(session, /Apprenants inscrits/);
  assert.match(session, /Ouvrir la fiche apprenant/);
});

test("A9: la fiche apprenant Studio refuse les identifiants hors périmètre ou hors session", () => {
  assert.match(learner, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(learner, /\.eq\("id", id\)[\s\S]*\.in\("organisation_id", organisationIds\)/);
  assert.match(learner, /requestedSessionId && !safeEnrolments\.some[\s\S]*notFound\(\)/);
  for (const source of ["daily_enrolment_support_needs", "daily_session_followup_entries", "daily_documents"]) {
    assert.match(learner, new RegExp(source + "[\\s\\S]*\\.eq\\(\\\"organisation_id\\\", learner\\.organisation_id\\)"));
  }
});
