import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { satisfactionOrganisationOptions, selectSatisfactionOrganisation } from "../src/lib/daily/satisfactionOrganisationScope.mjs";

const assigned = ["of-a", "of-b"];
const options = satisfactionOrganisationOptions([
  { id: "of-c", name: "Hors périmètre" },
  { id: "of-b", name: "École Été" },
  { id: "of-a", name: "", legal_name: "Académie" },
], assigned);

test("satisfaction multi-OF : seules les affectations agent figurent au sélecteur", () => {
  assert.deepEqual(options, [{ id: "of-a", name: "Académie" }, { id: "of-b", name: "École Été" }]);
});
test("satisfaction multi-OF : tous les organismes affectés restent sélectionnables", () => {
  assert.equal(selectSatisfactionOrganisation(undefined, options), "");
  assert.equal(selectSatisfactionOrganisation("", options), "");
  assert.equal(selectSatisfactionOrganisation("of-b", options), "of-b");
});
test("satisfaction multi-OF : refuse un organisme inconnu ou non affecté", () => {
  assert.equal(selectSatisfactionOrganisation("of-c", options), null);
  assert.equal(selectSatisfactionOrganisation("of-x", options), null);
  assert.equal(selectSatisfactionOrganisation(123, options), null);
});
test("satisfaction multi-OF : paramètres multiples bornés au premier choix", () => {
  assert.equal(selectSatisfactionOrganisation(["of-a", "of-c"], options), "of-a");
  assert.equal(selectSatisfactionOrganisation(["of-c", "of-a"], options), null);
});
test("satisfaction multi-OF : quatre sources et métriques bornées au même OF", async () => {
  const page = await readFile(new URL("../src/app/agent/daily/satisfaction/page.tsx", import.meta.url), "utf8");
  assert.match(page, /requireSupportAgent\(\)/);
  assert.match(page, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(page, /\.in\("id", assignedOrganisationIds\)/);
  assert.match(page, /if \(selectedOrganisation === null\)/);
  assert.match(page, /const organisationIds = selectedOrganisation \? \[selectedOrganisation\] : assignedOrganisationIds/);
  for (const table of ["daily_sessions", "daily_session_enrolments", "daily_learner_feedback_responses", "daily_stakeholder_satisfaction_responses"]) {
    assert.match(page, new RegExp('\\.from\\("'+table+'"\\)[\\s\\S]*?\\.in\\("organisation_id", organisationIds\\)'));
  }
  assert.match(page, /const rows = sessions\.map/);
  assert.match(page, /const sessionsWithResponses = rows\.filter/);
  assert.match(page, /DailySatisfactionCsvExport rows=\{visibleRows\.map/);
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});
test("satisfaction multi-OF : sélection, vues et export restent cohérents", async () => {
  const page = await readFile(new URL("../src/app/agent/daily/satisfaction/page.tsx", import.meta.url), "utf8");
  assert.match(page, /name="organisme" defaultValue=\{selectedOrganisation\}/);
  assert.match(page, /if \(selectedOrganisation\) search\.set\("organisme", selectedOrganisation\)/);
  assert.match(page, /name="vue" value=\{view\}/);
  assert.match(page, /Réinitialiser les filtres/);
  assert.match(page, /Export des seules sessions affichées/);
});
