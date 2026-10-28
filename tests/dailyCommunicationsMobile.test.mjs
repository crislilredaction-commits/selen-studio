import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/app/agent/daily/communications/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/agent/daily/communications/communications-mobile.module.css", import.meta.url), "utf8");

test("communications : filtres, compteurs et preuves utilisables sur mobile", () => {
  for (const name of ["page", "header", "metrics", "filterForm", "filterLabel", "filterControl", "submitButton", "resetLink", "signatureContent", "communicationContent", "actions", "actionLink", "detailsSummary", "messageContent"]) {
    assert.match(page, new RegExp("styles\\." + name));
  }
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /\.metrics, \.filterForm \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.actions \{ display: grid; grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /\.actionLink:focus-visible/);
});

test("communications : filtres et téléchargements de preuves conservés", () => {
  assert.match(page, /name="session_id" value=\{sessionId\}/);
  assert.match(page, /name="organisation_id" defaultValue=\{selectedOrganisationId\}/);
  for (const name of ["q", "etat", "categorie"]) assert.match(page, new RegExp('name="' + name + '"'));
  assert.match(page, /\/agent\/daily\/communications\/proof\?communication_id=/);
  assert.match(page, /\/agent\/daily\/communications\/document\?communication_id=/);
  assert.match(page, /\/agent\/daily\/session-dossiers\/\$\{communication\.session_id\}/);
  assert.match(page, /Une ouverture ou un clic ne vaut jamais signature/i);
});

test("communications : accès agent et périmètre multi-OF inchangés", () => {
  assert.match(page, /requireSupportAgent\(\)/);
  assert.match(page, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(page, /if \(selectedOrganisationId === null\)/);
  assert.match(page, /\.in\("organisation_id", scopedOrganisationIds\)/);
  assert.match(page, /filterCommunicationHistory\(/);
  assert.doesNotMatch(page, /\.(?:insert|upsert|update|delete)\(/);
});
