import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/app/agent/daily/revues-formateurs/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/agent/daily/revues-formateurs/trainer-reviews-mobile.module.css", import.meta.url), "utf8");

test("bilans formateurs : liste, compteurs et filtres s'adaptent au mobile", () => {
  for (const name of ["page", "header", "stats", "card", "filters", "filterLabel", "filterInput", "reviewCard", "statusBox"]) {
    assert.match(page, new RegExp("styles\\." + name));
  }
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /\.reviewCard \{ grid-template-columns: minmax\(0, 1fr\) !important; \}/);
  assert.match(css, /\.statusBox \{ justify-items: start !important; \}/);
  assert.match(css, /\.filters \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});

test("bilans formateurs : champs et liens utilisables au tactile et au clavier", () => {
  assert.match(page, /role="search"/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /name="organisme" defaultValue=\{selectedOrganisation\}/);
  assert.match(css, /\.filterInput \{ min-height: 44px; \}/);
  assert.match(css, /\.filterButton \{ min-height: 44px; \}/);
  assert.match(css, /\.filterInput:focus-visible/);
  assert.match(css, /overflow-wrap: anywhere/);
});

test("bilans formateurs : lecture seule et périmètre organisme inchangés", () => {
  assert.match(page, /requireSupportAgent\(\)/);
  assert.match(page, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(page, /if \(selectedOrganisation === null\)/);
  assert.match(page, /const scopedOrganisationIds = selectedOrganisation \? \[selectedOrganisation\] : dailyOrganisationIds/);
  assert.match(page, /\.in\("organisation_id", scopedOrganisationIds\)/);
  assert.match(page, /\.in\("trainer_profile_id", trainerIds\)/);
  assert.doesNotMatch(page, /\.(?:insert|upsert|update|delete)\(/);
});
