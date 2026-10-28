import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/app/agent/daily/indicateurs/page.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/app/agent/daily/indicateurs/indicators-mobile.module.css", import.meta.url), "utf8");

test("indicateurs mobile : cartes à 820px et tableau conservé sur ordinateur", () => {
  assert.match(page, /className=\{styles\.mobileCards\}/);
  assert.match(page, /className=\{styles\.desktopTable\}/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /\.desktopTable \{ display: none; \}/);
  assert.match(css, /\.mobileCards \{ display: grid; gap: 12px; \}/);
  assert.match(css, /@media \(max-width: 360px\)/);
});

test("indicateurs mobile : mêmes organismes filtrés et mêmes métriques sur les deux vues", () => {
  assert.match(page, /const organisationMetrics = visibleOrganisations\.map\(\(organisation\) =>/);
  assert.equal((page.match(/organisationMetrics\.map\(\(\{ organisation, sessionsCount, enrolmentsCount, presence, objectives, satisfaction, attention \}\) =>/g) ?? []).length, 2);
  for (const key of ["sessionsCount", "enrolmentsCount", "presence", "objectives", "satisfaction", "attention"]) {
    assert.match(page, new RegExp(key + ":"));
    assert.match(page.split('className={styles.mobileCards}')[1].split('className={styles.desktopTable}')[0], new RegExp("\\{" + key + "\\}"));
  }
  assert.match(page, /filterIndicatorOrganisations\(organisations, query, view, attentionByOrg\)/);
});

test("indicateurs mobile : accès dossier canonique, intitulés et navigation clavier", () => {
  assert.match(page, /aria-label="Indicateurs par organisme sur mobile"/);
  assert.match(page, /<dl className=\{styles\.mobileStats\}>/);
  assert.match(page, /href=\{`\/agent\/daily\/organisations\/\$\{organisation\.id\}`\}/);
  assert.match(page, /Points à examiner/);
  assert.match(css, /\.mobileLink:focus-visible/);
});

test("indicateurs mobile : aucune requête, écriture ou élargissement du périmètre", () => {
  const mobile = page.split('<div className={styles.mobileCards}')[1]?.split('<div className={styles.desktopTable}')[0];
  assert.ok(mobile);
  assert.doesNotMatch(mobile, /fetch\(|\.from\(|\.insert\(|\.update\(|\.delete\(|<form/);
  assert.match(page, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(page, /resolveIndicatorOrganisationSelection\(params\?\.organisation_id, organisationIds\)/);
  assert.match(page, /if \(!selection\.valid\)/);
  assert.match(page, /organisationIds\.length\s*\?\s*await Promise\.all/);
});
