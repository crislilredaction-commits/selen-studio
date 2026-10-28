import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/app/agent/daily/suivi-sessions/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/agent/daily/suivi-sessions/session-followup-mobile.module.css", import.meta.url), "utf8");

test("suivi sessions mobile : grille lisible, en-tête empilé et cartes sans débordement", () => {
  for (const name of ["page", "header", "stats", "rowHead", "metaGrid", "date", "followupCard", "actions"]) {
    assert.match(page, new RegExp("className=\\{styles\\." + name + "\\}"));
  }
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /\.stats, \.metaGrid \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.followupCard \{ min-width: 0; overflow-wrap: anywhere; \}/);
});

test("suivi sessions : accès direct au dossier seulement si la session appartient à l'organisme de la ligne", () => {
  assert.match(page, /session\?\.id && session\.organisation_id === entry\.organisation_id/);
  assert.match(page, /href=\{\`\/agent\/daily\/session-dossiers\/\$\{session\.id\}\`\}/);
  assert.match(page, /Ouvrir la session/);
  assert.match(page, /href=\{\`\/agent\/daily\/organisations\/\$\{entry\.organisation_id\}\`\}/);
  assert.match(css, /\.actionLink:focus-visible/);
});

test("suivi sessions : mêmes lignes filtrées et périmètre serveur, aucune écriture ajoutée", () => {
  assert.match(page, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(page, /if \(!selection\.valid\)/);
  assert.match(page, /\.in\("organisation_id", scopedOrganisationIds\)/);
  assert.match(page, /buildScopedSessionFollowupRows\(/);
  assert.match(page, /const visibleRows = filterSessionFollowupRows\(rows, filters\)/);
  assert.match(page, /visibleRows\.map\(\(\{ entry, session, formation, organisation, actionable \}\) =>/);
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});
