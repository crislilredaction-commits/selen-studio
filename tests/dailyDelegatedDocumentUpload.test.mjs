import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath = new URL("../src/app/agent/api/daily/delegated-documents/route.ts", import.meta.url);
const layoutPath = new URL("../src/app/agent/daily/organisations/[id]/layout.tsx", import.meta.url);
const pagePath = new URL("../src/app/agent/daily/organisations/[id]/import-document/page.tsx", import.meta.url);
const formPath = new URL("../src/app/agent/daily/organisations/[id]/import-document/DelegatedDocumentUpload.tsx", import.meta.url);
const workspacePath = new URL("../src/lib/server/dailyStudioOrganisationDocuments.ts", import.meta.url);
const migrationPath = new URL("../supabase/migrations/20261008213000_daily_delegated_document_import.sql", import.meta.url);

test("delegated Daily upload reuses canonical document storage and links", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /isDailyOrganisationInAgentScope/);
  assert.match(source, /rpc\("daily_register_delegated_document"/);
  assert.match(source, /storage\.from\(BUCKET\)\.upload/);
  assert.match(source, /p_agent_profile_id/);
  assert.match(source, /source: "studio_delegation"/);
  assert.match(source, /organisation:\$\{organisationId\}/);
  assert.match(source, /ENTITY_TABLES/);
  assert.match(source, /eq\("organisation_id", organisationId\)/);
  assert.match(source, /ALLOWED_MIME_TYPES/);
  assert.match(source, /MAX_FILE_SIZE = 25 \* 1024 \* 1024/);
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
  assert.match(page, /id, display_name, professional_email/);
  assert.match(page, /\["display_name", "professional_email"\]/);
  assert.doesNotMatch(page, /daily_trainer_profiles"\)\.select\("[^"]*\bemail\b[^"]*"\)/);
  assert.match(page, /daily_formations"\)\.select\("id, title"\)/);
  assert.doesNotMatch(page, /daily_formations"\)\.select\("[^"]*\bname\b[^"]*"\)/);
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

test("delegated import always clears loading and exposes visible success and error feedback", async () => {
  const form = await readFile(formPath, "utf8");
  assert.match(form, /const formElement = event\.currentTarget/);
  assert.match(form, /finally\s*{\s*setBusy\(false\)/);
  assert.match(form, /role={feedback\.kind === "error" \? "alert" : "status"}/);
  assert.match(form, /Le serveur n’est pas joignable/);
  assert.match(form, /25 Mo maximum/);
});

test("delegated replacement is atomic, versioned and keeps a consultable history", async () => {
  const [form, workspace, migration] = await Promise.all([
    readFile(formPath, "utf8"), readFile(workspacePath, "utf8"), readFile(migrationPath, "utf8"),
  ]);
  assert.match(form, /replace_document_id/);
  assert.match(form, /expected_updated_at/);
  assert.match(form, /Version courante/);
  assert.match(form, /Historique/);
  assert.match(workspace, /isHistoricalDelegatedDocument/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /for update/);
  assert.match(migration, /previous_document_id/);
  assert.match(migration, /status = 'archived'/);
  assert.match(migration, /copied_from_document_id/);
  assert.match(migration, /revoke all on function public\.daily_register_delegated_document/);
  assert.match(migration, /grant execute .* to service_role/);
});
