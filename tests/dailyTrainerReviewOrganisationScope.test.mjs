import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { selectTrainerReviewOrganisation, trainerReviewOrganisationOptions } from "../src/lib/daily/trainerReviewOrganisationScope.mjs";

test("options des bilans limitées aux OF affectés, dédoublonnées et triées", () => {
  const input = [
    { id: "of-a", name: "École Alpha", legal_name: null },
    { id: "of-c", name: "Confidentiel" },
    { id: "of-b", name: "Bêta", legal_name: "Bêta Formation" },
    { id: "of-a", name: "Doublon" },
  ];
  const before = structuredClone(input);
  assert.deepEqual(trainerReviewOrganisationOptions(input, ["of-a", "of-b"]), [
    { id: "of-b", name: "Bêta Formation" },
    { id: "of-a", name: "École Alpha" },
  ]);
  assert.deepEqual(input, before);
});

test("sélection absente et identifiants non autorisés sont distingués", () => {
  const options = [{ id: "of-a", name: "Alpha" }];
  assert.equal(selectTrainerReviewOrganisation(undefined, options), "");
  assert.equal(selectTrainerReviewOrganisation("of-a", options), "of-a");
  assert.equal(selectTrainerReviewOrganisation(["of-a", "of-b"], options), "of-a");
  assert.equal(selectTrainerReviewOrganisation("of-b", options), null);
  assert.equal(selectTrainerReviewOrganisation("of-a?other", options), null);
});

test("absence de nom et affectations vides sans fuite", () => {
  assert.deepEqual(trainerReviewOrganisationOptions([{ id: "of-a", name: " " }], ["of-a"]), [
    { id: "of-a", name: "Organisme sans nom" },
  ]);
  assert.deepEqual(trainerReviewOrganisationOptions([{ id: "of-a", name: "Alpha" }], []), []);
});

const page = readFileSync(new URL("../src/app/agent/daily/revues-formateurs/page.tsx", import.meta.url), "utf8");

test("auth et périmètre précèdent les lectures service-role des organismes et formateurs", () => {
  const auth = page.indexOf("await requireSupportAgent()");
  const scope = page.indexOf("await getDailyOrganisationIdsForAgent(auth.email)");
  const orgs = page.indexOf('.from("organisations")');
  const trainers = page.indexOf('.from("daily_trainer_profiles")');
  assert.ok(auth >= 0 && auth < scope && scope < orgs && orgs < trainers);
  assert.match(page, /\.in\("id", dailyOrganisationIds\)/);
  assert.match(page, /\.in\("organisation_id", scopedOrganisationIds\)/);
  assert.match(page, /if \(selectedOrganisation === null\)/);
  assert.match(page, /\.in\("trainer_profile_id", trainerIds\)/);
});

test("compteurs et cartes utilisent exclusivement les formateurs filtrés", () => {
  assert.match(page, /const trainerIds = \(trainers \?\? \[\]\)\.map/);
  assert.match(page, /const rows = \(trainers \?\? \[\]\)\.map/);
  assert.match(page, /const fullyCompleted = rows\.filter/);
  assert.match(page, /const awaitingManager = rows\.filter/);
  assert.match(page, /const toStart = rows\.filter/);
  assert.match(page, /name="organisme" defaultValue=\{selectedOrganisation\}/);
  assert.match(page, /name="q"/);
  assert.match(page, /name="state"/);
  assert.match(page, /name="year"/);
  assert.match(page, /organisationNames\.get\(trainer\.organisation_id\)/);
});

test("aucune mutation métier, email ni signature déclenchée", () => {
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|resend\.emails\.send\(/);
});
