import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/app/agent/daily/planning/page.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/app/agent/daily/planning/planning-mobile.module.css", import.meta.url), "utf8");

test("planning mobile : une liste lisible remplace la grille horizontale sous 820 px", () => {
  assert.match(page, /className=\{styles\.mobileList\}/);
  assert.match(page, /className=\{styles\.desktopTimeline\}/);
  assert.match(styles, /@media \(max-width: 820px\)/);
  assert.match(styles, /\.desktopTimeline\s*\{\s*display: none;/);
  assert.match(styles, /\.mobileList\s*\{\s*display: grid;/);
});

test("planning mobile : les cartes utilisent les mêmes sessions déjà filtrées que la grille", () => {
  assert.equal((page.match(/visibleActiveRows\.map\(\(row\) =>/g) ?? []).length, 2);
  assert.match(page, /filterDailyPlanningRows\(activeRows, query, stateFilter\)/);
  assert.match(page, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(page, /\.from\("daily_session_dossiers"\)[\s\S]*?\.in\("organisation_id", organisationIds\)/);
});

test("planning mobile : accès au dossier canonique et informations essentielles", () => {
  assert.match(page, /aria-label="Sessions du planning en liste mobile"/);
  assert.match(page, /aria-label=\{\x60Ouvrir le dossier de/);
  assert.match(page, /href=\{\x60\/agent\/daily\/session-dossiers\/\$\{row\.sessionId\}\/full\x60\}/);
  assert.match(page, /formatDateRange\(row\.start, row\.end\)/);
  assert.match(page, /row\.openChecklist > 0/);
  assert.match(page, /stateStyle\(row\.state\)/);
});

test("planning mobile : état vide et accès clavier visibles", () => {
  assert.match(page, /visibleActiveRows\.length === 0/);
  assert.match(page, /Aucune session ne correspond aux filtres sélectionnés/);
  assert.match(styles, /\.mobileCard:focus-visible/);
  assert.match(styles, /outline: 3px solid/);
});

test("planning mobile : aucune action métier ni nouvelle lecture n'est ajoutée", () => {
  const mobile = page.split('<section className={styles.mobileList}')[1]?.split('<div className={styles.desktopTimeline}')[0];
  assert.ok(mobile);
  assert.doesNotMatch(mobile, /fetch\(|\.from\(|\.insert\(|\.update\(|\.delete\(|<form/);
  assert.match(page, /requireSupportAgent\(\)/);
  assert.match(page, /if \(!auth\.ok\)/);
});
