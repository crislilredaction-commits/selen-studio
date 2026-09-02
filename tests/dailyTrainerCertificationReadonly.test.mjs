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

test("la migration retire les écritures staff et manager sans toucher aux écritures propres du formateur", () => {
  assert.match(migration, /DROP POLICY IF EXISTS daily_trainer_certifications_staff_all/);
  assert.match(migration, /DROP POLICY IF EXISTS daily_trainer_certifications_manager_insert/);
  assert.match(migration, /DROP POLICY IF EXISTS daily_trainer_certifications_manager_update/);
  assert.match(migration, /DROP POLICY IF EXISTS daily_trainer_certifications_manager_delete/);
  assert.match(migration, /CREATE POLICY daily_trainer_certifications_staff_select/);
  assert.match(migration, /DROP POLICY IF EXISTS "Staff can manage Daily trainer document links"/);
  assert.match(migration, /DROP POLICY IF EXISTS "Managers can manage organisation trainer document links"/);
  assert.match(migration, /CREATE POLICY "Staff can read Daily trainer document links"/);
  assert.match(migration, /daily_guard_trainer_certification_self_write/);
  assert.doesNotMatch(migration, /DROP POLICY IF EXISTS daily_trainer_certifications_own_(insert|update|delete)/);
  assert.doesNotMatch(migration, /DROP POLICY IF EXISTS "Trainers can link own certification proof documents"/);
});
