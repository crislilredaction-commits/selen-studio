import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  stakeholderFeedbackOrganisationOptions, selectStakeholderFeedbackOrganisation,
} from "../src/lib/daily/stakeholderFeedbackOrganisationScope.mjs";

const page = readFileSync(new URL("../src/app/agent/daily/reclamations/page.tsx", import.meta.url), "utf8");
const assigned = ["of-a", "of-b"];
const options = stakeholderFeedbackOrganisationOptions([
  { id: "of-c", legal_name: "Non affecté" },
  { id: "of-b", name: "École Été", status: "active" },
  { id: "of-a", legal_name: "Académie", status: "active" },
  { id: "of-a", name: "Doublon", status: "active" },
  { id: "of-d", name: "Archivé", status: "archived" },
], assigned);

test("réclamations multi-OF : seules les affectations non archivées sont proposées", () => {
  assert.deepEqual(options, [{ id: "of-a", name: "Académie" }, { id: "of-b", name: "École Été" }]);
});

test("réclamations multi-OF : toutes les affectations restent disponibles par défaut", () => {
  assert.equal(selectStakeholderFeedbackOrganisation(undefined, options), "");
  assert.equal(selectStakeholderFeedbackOrganisation("", options), "");
  assert.equal(selectStakeholderFeedbackOrganisation("of-b", options), "of-b");
});

test("réclamations multi-OF : refus explicite des organismes non affectés ou inconnus", () => {
  for (const value of ["of-c", "of-d", "intrus", 42, null]) {
    assert.equal(selectStakeholderFeedbackOrganisation(value, options), null);
  }
});

test("réclamations multi-OF : premier choix de paramètre multiple fait foi, sans repli", () => {
  assert.equal(selectStakeholderFeedbackOrganisation(["of-a", "of-c"], options), "of-a");
  assert.equal(selectStakeholderFeedbackOrganisation(["of-c", "of-a"], options), null);
});

test("réclamations multi-OF : sélection validée avant lecture des retours", () => {
  assert.match(page, /requireSupportAgent\(\)/);
  assert.match(page, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(page, /\.from\("organisations"\)[\s\S]*?\.in\("id", organisationIds\)/);
  assert.match(page, /if \(selectedOrganisation === null\)/);
  assert.match(page, /const scopedOrganisationIds = selectedOrganisation \? \[selectedOrganisation\] : organisationIds/);
  assert.match(page, /\.from\("daily_stakeholder_feedback"\)[\s\S]*?\.in\("organisation_id", scopedOrganisationIds\)/);
  assert.ok(page.indexOf("if (selectedOrganisation === null)") < page.indexOf('.from("daily_stakeholder_feedback")'));
});

test("réclamations multi-OF : compteurs et tri calculés uniquement après lecture bornée", () => {
  assert.ok(page.indexOf("const rows =") > page.indexOf('.in("organisation_id", scopedOrganisationIds)'));
  assert.match(page, /const complaintCount = rows\.filter/);
  assert.match(page, /const stageCounts = countStakeholderFeedbackStages\(rows\)/);
  assert.match(page, /name="organisme" defaultValue=\{selectedOrganisation\}/);
  assert.match(page, /name="q"/);
  assert.match(page, /name="etape"/);
  assert.match(page, /name="type"/);
  assert.doesNotMatch(page, /\.(insert|update|delete|upsert)\(/);
});
