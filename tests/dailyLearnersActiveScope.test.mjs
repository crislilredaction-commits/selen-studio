import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const learnersPage = readFileSync(new URL("../src/app/agent/daily/learners/page.tsx", import.meta.url), "utf8");

test("la vue apprenants réutilise le périmètre canonique actif et affecté à l'agent", () => {
  assert.match(learnersPage, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.doesNotMatch(learnersPage, /getActiveDailyOrganisationIds/);
  assert.match(learnersPage, /\.from\("daily_session_enrolments"\)[\s\S]*\.in\("organisation_id", organisationIds\)/);
});

test("les besoins d'adaptation restent bornés aux inscriptions visibles", () => {
  assert.match(learnersPage, /const enrolmentIds = activeEnrolments\.map/);
  assert.match(learnersPage, /\.from\("daily_enrolment_support_needs"\)[\s\S]*\.in\("enrolment_id", enrolmentIds\)/);
});

test("les désinscriptions quittent la liste et les compteurs actifs sans perdre l'historique", () => {
  assert.match(learnersPage, /INACTIVE_ENROLMENT_STATUSES = new Set\(\["declined", "cancelled", "canceled", "abandoned"\]\)/);
  assert.match(learnersPage, /const activeEnrolments = allEnrolments\.filter\(\(item\) => isActiveEnrolment\(item\.status\)\)/);
  assert.match(learnersPage, /const historicalEnrolments = allEnrolments\.filter\(\(item\) => !isActiveEnrolment\(item\.status\)\)/);
  assert.match(learnersPage, /\["Participants actifs",activeLearners\]/);
  assert.match(learnersPage, /scopedActiveEnrolments\.filter\(\(e\) => \["not_started","sent","submitted"\]\.includes\(e\.positioning_status\)\)/);
  assert.match(learnersPage, /filterLearnerOrganisation\(activeEnrolments, selectedOrganisation\.id\)/);
  assert.match(learnersPage, /Historique des inscriptions closes/);
  assert.match(learnersPage, /Consulter l’historique/);
});

test("un périmètre Daily vide ne déclenche pas de requête globale", () => {
  assert.match(learnersPage, /organisationIds\.length\s*\?\s*await admin/);
  assert.match(learnersPage, /enrolmentIds\.length\s*\?\s*await admin/);
});
