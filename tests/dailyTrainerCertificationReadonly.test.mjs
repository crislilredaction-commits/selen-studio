import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const organisationPage = await readFile(
  new URL("../src/app/agent/daily/organisations/[id]/page.tsx", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL("../supabase/migrations/20260902082000_daily_trainer_certification_write_ownership.sql", import.meta.url),
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

test("la base réserve les écritures certification et justificatif au formateur propriétaire", () => {
  assert.match(migration, /daily_trainer_certifications_insert_self/);
  assert.match(migration, /daily_trainer_certifications_update_self/);
  assert.match(migration, /daily_trainer_certifications_delete_self/);
  assert.match(migration, /daily_trainer_certification_documents_insert_self/);
  assert.match(migration, /daily_guard_trainer_certification_ownership/);
  assert.match(migration, /daily_guard_trainer_certification_document_ownership/);
  assert.doesNotMatch(migration, /staff.*insert.*daily_trainer_certifications/is);
});
