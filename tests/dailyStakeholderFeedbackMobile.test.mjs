import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/app/agent/daily/reclamations/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/agent/daily/reclamations/feedback-mobile.module.css", import.meta.url), "utf8");

test("réclamations mobile : en-tête, statistiques, métadonnées et actions adaptatifs", () => {
  for (const name of ["page", "header", "stats", "rowHead", "date", "metaGrid", "actions", "feedbackCard", "filterGrid", "filterActions"]) {
    assert.match(page, new RegExp("className=\\{styles\\." + name + "\\}"));
  }
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /\.stats \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /\.metaGrid \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.feedbackCard \{ min-width: 0; overflow-wrap: anywhere; \}/);
});

test("réclamations mobile : filtres accessibles et liens utilisables au clavier", () => {
  assert.match(page, /className=\{styles\.filterControl\}/);
  assert.match(page, /className=\{styles\.actionLink\}/);
  assert.match(css, /\.back:focus-visible, \.actionLink:focus-visible/);
  assert.match(page, /href=\{\x60\/agent\/daily\/organisations\/\$\{item\.organisation_id\}\x60\}/);
});

test("réclamations mobile : lecture seule et périmètre agent inchangés", () => {
  assert.match(page, /requireSupportAgent\(\)/);
  assert.match(page, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(page, /if \(selectedOrganisation === null\)/);
  assert.match(page, /\.in\("organisation_id", scopedOrganisationIds\)/);
  assert.match(page, /visibleRows\.map\(\(\{ item, organisation, resolved \}\) =>/);
  assert.doesNotMatch(page, /\.(insert|update|delete|upsert)\(/);
});
