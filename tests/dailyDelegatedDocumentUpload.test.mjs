import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath = new URL("../src/app/agent/api/daily/delegated-documents/route.ts", import.meta.url);
const layoutPath = new URL("../src/app/agent/daily/organisations/[id]/layout.tsx", import.meta.url);
const pagePath = new URL("../src/app/agent/daily/organisations/[id]/import-document/page.tsx", import.meta.url);
const formPath = new URL("../src/app/agent/daily/organisations/[id]/import-document/DelegatedDocumentUpload.tsx", import.meta.url);

test("delegated Daily upload reuses canonical document storage and links", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /isDailyOrganisationInAgentScope/);
  assert.match(source, /from\("daily_documents"\)\.insert/);
  assert.match(source, /from\("daily_document_links"\)\.insert/);
  assert.match(source, /storage\.from\(BUCKET\)\.upload/);
  assert.match(source, /created_by_agent_profile_id/);
  assert.match(source, /source: "studio_delegation"/);
  assert.match(source, /organisation:\$\{organisationId\}/);
});

test("organisation dossier exposes delegated import entry point", async () => {
  const source = await readFile(layoutPath, "utf8");
  assert.match(source, /\/import-document/);
  assert.match(source, /Importer en délégation/);
});

test("delegated import offers organisation-scoped business choices instead of UUID fields", async () => {
  const page = await readFile(pagePath, "utf8");
  const form = await readFile(formPath, "utf8");
  for (const table of ["daily_trainer_profiles", "daily_learners", "daily_formations", "daily_sessions", "daily_session_enrolments"]) {
    assert.match(page, new RegExp(`from\\(\\"${table}\\"\\).*eq\\(\\"organisation_id\\", id\\)`));
  }
  assert.match(page, /first_name, last_name, email/);
  assert.match(page, /internal_reference/);
  assert.match(page, /learner_id, session_id, status/);
  assert.match(page, /learnerById/);
  assert.match(page, /sessionById/);
  assert.match(page, /Ajouter un document pour cet OF/);
  assert.match(form, /<EntitySelect name="trainer_id"/);
  assert.match(form, /<EntitySelect name="learner_id"/);
  assert.match(form, /<EntitySelect name="formation_id"/);
  assert.match(form, /<EntitySelect name="session_id"/);
  assert.match(form, /<EntitySelect name="enrolment_id"/);
  assert.doesNotMatch(form, /placeholder="UUID facultatif"/);
  assert.match(form, /Aucun identifiant technique n’est à recopier/);
});
