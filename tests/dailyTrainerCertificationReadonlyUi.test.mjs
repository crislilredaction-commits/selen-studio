import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const organisationPage = await readFile(
  new URL("../src/app/agent/daily/organisations/[id]/page.tsx", import.meta.url),
  "utf8",
);
const organisationLayout = await readFile(
  new URL("../src/app/agent/daily/organisations/[id]/layout.tsx", import.meta.url),
  "utf8",
);
const proofPage = await readFile(
  new URL("../src/app/agent/daily/organisations/[id]/trainer-certification-proofs/page.tsx", import.meta.url),
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

test("Studio expose les justificatifs actuels aux agents en lecture seule", () => {
  assert.match(organisationLayout, /trainer-certification-proofs/);
  assert.match(proofPage, /requireSupportAgent\(\)/);
  assert.match(proofPage, /trainer_qualification_proof/);
  assert.match(proofPage, /is_current/);
  assert.match(proofPage, /createSignedUrl/);
  assert.match(proofPage, /Lecture seule/);
  assert.doesNotMatch(proofPage, /\.insert\(/);
  assert.doesNotMatch(proofPage, /\.update\(/);
  assert.doesNotMatch(proofPage, /\.delete\(/);
  assert.doesNotMatch(proofPage, /\.upload\(/);
});
