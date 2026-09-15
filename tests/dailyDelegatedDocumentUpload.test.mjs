import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath = new URL("../src/app/agent/api/daily/delegated-documents/route.ts", import.meta.url);
const layoutPath = new URL("../src/app/agent/daily/organisations/[id]/layout.tsx", import.meta.url);

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
