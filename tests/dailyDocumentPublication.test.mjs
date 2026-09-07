import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const helper = readFileSync(new URL("../src/lib/server/dailyDocumentPublication.ts", import.meta.url), "utf8");
const pretrainingRoute = readFileSync(new URL("../src/app/agent/api/daily/pretraining-documents/route.ts", import.meta.url), "utf8");
const posttrainingRoute = readFileSync(new URL("../src/app/agent/api/daily/posttraining-documents/route.ts", import.meta.url), "utf8");
const pretrainingPage = readFileSync(new URL("../src/app/agent/daily/pretraining-documents/page.tsx", import.meta.url), "utf8");
const posttrainingPage = readFileSync(new URL("../src/app/agent/daily/posttraining-documents/page.tsx", import.meta.url), "utf8");

test("la publication Daily part uniquement d'une version validée et renseigne published_at", () => {
  assert.match(helper, /document\.status !== "validated"/);
  assert.match(helper, /status: "published"/);
  assert.match(helper, /published_at: publishedAt/);
  assert.match(helper, /\.eq\("status", "validated"\)/);
});

test("la publication trace la notification et fige la version exacte du document", () => {
  assert.match(helper, /\.from\("daily_communications"\)/);
  assert.match(helper, /communication_type: "document_publication"/);
  assert.match(helper, /\.from\("daily_communication_documents"\)/);
  assert.match(helper, /document_version: document\.version/);
  assert.match(helper, /sendClientEmailWithSilence/);
});

for (const [label, source] of [["préformation", pretrainingRoute], ["fin de formation", posttrainingRoute]]) {
  test(`la route ${label} expose une publication bornée au périmètre Daily actif`, () => {
    assert.match(source, /publishDailyDocument/);
    assert.match(source, /"publish"/);
    assert.match(source, /getActiveDailyOrganisationIds/);
    assert.match(source, /Le document doit être validé avant publication/);
  });
}

test("les écrans Studio proposent Publier seulement après validation", () => {
  assert.match(pretrainingPage, /doc\.status === "validated"[\s\S]*Publier/);
  assert.match(posttrainingPage, /doc\.status === "validated"[\s\S]*Publier/);
});

test("le fallback postformation conserve les états publiés comme conformes", () => {
  assert.match(posttrainingRoute, /\["validated","published","signed","active"\]/);
});
