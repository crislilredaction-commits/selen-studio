import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const organisationPage = await readFile(
  new URL("../src/app/agent/daily/organisations/[id]/page.tsx", import.meta.url),
  "utf8",
);

test("Studio consulte les certifications formateur sans chemin d’écriture agent", () => {
  assert.match(organisationPage, /Certifications en consultation uniquement dans Studio/);
  assert.doesNotMatch(organisationPage, /async function addCertification/);
  assert.doesNotMatch(organisationPage, /async function deleteCertification/);
  assert.doesNotMatch(organisationPage, /Ajouter la certification/);
  assert.doesNotMatch(organisationPage, /certification_id/);
  assert.doesNotMatch(organisationPage, /daily_trainer_certifications"\)\.insert/);
  assert.doesNotMatch(organisationPage, /daily_trainer_certifications"\)\.delete/);
});
