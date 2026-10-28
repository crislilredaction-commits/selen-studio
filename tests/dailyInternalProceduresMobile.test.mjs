import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/app/agent/daily/procedures-internes/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/agent/daily/procedures-internes/procedures-mobile.module.css", import.meta.url), "utf8");

test("procédures internes : cartes, filtres et compteurs adaptés au mobile", () => {
  for (const name of ["page", "header", "stats", "stat", "statDue", "filterForm", "submitButton", "priorityNav", "priorityLink", "list", "cardOk", "cardDue", "rowHead", "statusBox", "metaGrid", "organisationLink"]) {
    assert.match(page, new RegExp("styles\\." + name));
  }
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /\.stats, \.filterForm, \.metaGrid \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.rowHead \{ flex-direction: column;/);
  assert.match(css, /\.cardOk, \.cardDue \{ min-width: 0;/);
});

test("procédures internes : filtres accessibles et sélection d'organisme préservée", () => {
  assert.match(page, /aria-label="Choisir un organisme Daily"/);
  assert.match(page, /aria-label="Rechercher et prioriser les procédures"/);
  assert.match(page, /aria-label="Filtrer les procédures par priorité"/);
  assert.match(page, /if \(selectedOrganisation\) search\.set\("organisme", selectedOrganisation\)/);
  assert.match(page, /name="organisme" defaultValue=\{selectedOrganisation\}/);
  assert.match(page, /role="status"/);
  assert.match(css, /\.priorityLink:focus-visible/);
  assert.match(css, /\.filterForm input:focus-visible/);
});

test("procédures internes : périmètre et lecture seule inchangés", () => {
  assert.match(page, /requireSupportAgent\(\)/);
  assert.match(page, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(page, /selectProcedureOrganisation\(params\?\.organisme, organisationOptions\)/);
  assert.match(page, /\.in\("organisation_id", scopedOrganisationIds\)/);
  assert.match(page, /filterAndPrioritizeProcedures\(rows, query, view\)/);
  assert.doesNotMatch(page, /\.(?:insert|upsert|update|delete)\(/);
});
