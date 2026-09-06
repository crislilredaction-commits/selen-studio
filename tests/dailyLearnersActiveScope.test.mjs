import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const learnersPage = readFileSync(new URL("../src/app/agent/daily/learners/page.tsx", import.meta.url), "utf8");

test("la vue apprenants réutilise le périmètre canonique Daily actif", () => {
  assert.match(learnersPage, /getActiveDailyOrganisationIds/);
  assert.match(learnersPage, /\.from\("daily_learners"\)[\s\S]*\.in\("organisation_id", organisationIds\)/);
  assert.match(learnersPage, /\.from\("daily_session_enrolments"\)[\s\S]*\.in\("organisation_id", organisationIds\)/);
});

test("les besoins d'adaptation restent bornés aux inscriptions visibles", () => {
  assert.match(learnersPage, /const enrolmentIds = \(enrolments \?\? \[\]\)\.map/);
  assert.match(learnersPage, /\.from\("daily_enrolment_support_needs"\)[\s\S]*\.in\("enrolment_id", enrolmentIds\)/);
});

test("un périmètre Daily vide ne déclenche pas de requête globale", () => {
  assert.match(learnersPage, /organisationIds\.length\s*\?\s*await Promise\.all/);
  assert.match(learnersPage, /enrolmentIds\.length\s*\?\s*await admin/);
});
