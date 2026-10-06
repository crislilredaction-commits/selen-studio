import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routePath = new URL("../src/app/agent/api/daily/pretraining-documents/route.ts", import.meta.url);
const pagePath = new URL("../src/app/agent/daily/pretraining-documents/page.tsx", import.meta.url);
const downloadPath = new URL("../src/app/agent/api/daily/pretraining-documents/download/route.ts", import.meta.url);
const migrationPath = new URL("../supabase/migrations/20261006023000_daily_a6_contractual_documents.sql", import.meta.url);

const requiredTypes = [
  "training_program",
  "training_agreement",
  "training_contract",
  "convocation",
  "registration_positioning",
  "welcome_booklet",
  "internal_regulations",
];

test("Studio pretraining review includes every required document family", async () => {
  const [route, page, download, migration] = await Promise.all([
    readFile(routePath, "utf8"),
    readFile(pagePath, "utf8"),
    readFile(downloadPath, "utf8"),
    readFile(migrationPath, "utf8"),
  ]);

  for (const type of requiredTypes) {
    assert.match(route, new RegExp(`\\"${type}\\"`), `${type} must be queried by Studio`);
    assert.match(page, new RegExp(`${type}:`), `${type} must have a Studio label`);
    assert.match(download, new RegExp(`\\"${type}\\"`), `${type} must be downloadable by Studio`);
  }

  assert.match(page, /Livret d’accueil/);
  assert.match(page, /Règlement intérieur/);
  assert.match(page, /Convention/);
  assert.match(page, /Contrat individuel/);
  assert.match(page, /Remplacer la version/);
  assert.match(route, /source: "studio_agent_replacement"/);
  assert.match(route, /previous_document_id: current.id/);
  assert.match(route, /eq\("updated_at", expectedUpdatedAt\)/);
  assert.match(route, /\["published", "signed", "archived"\]/);
  assert.match(migration, /training_contract/);
  assert.match(migration, /contracting_party_type is null/);
  assert.match(migration, /count\(distinct nullif\(btrim\(company_name\), ''\)\)/);
  assert.match(migration, /status not in \('declined','cancelled','abandoned'\)/);
  assert.doesNotMatch(migration, /\b(delete from|truncate)\b/i);
});
