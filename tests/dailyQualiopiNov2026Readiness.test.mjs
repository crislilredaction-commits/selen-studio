import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const checklist = await readFile(new URL("../src/lib/daily/qualiopiPreauditChecklist.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../src/app/agent/daily/preaudit/[actionId]/page.tsx", import.meta.url), "utf8");

test("les exigences du décret 2026-728 restent futures jusqu'au 1er novembre 2026", () => {
  assert.match(checklist, /effectiveFrom: "2026-11-01"/);
  assert.match(checklist, /Décret n° 2026-728 du 1er août 2026/);
  assert.match(checklist, /exigences futures sont affichées comme éléments à anticiper/i);
  assert.match(page, /À anticiper à partir du/);
  assert.match(page, /regulatoryReadiness/);
});

test("l'indicateur 12 anticipe violences harcèlement et discriminations sans remplacer les preuves actuelles", () => {
  assert.match(checklist, /indicators: "12"[\s\S]*Procédure de gestion et prévention des absences et abandons/);
  assert.match(checklist, /indicators: "12"[\s\S]*violences sexistes et sexuelles[\s\S]*harcèlement[\s\S]*discriminations/);
});

test("l'indicateur 27 conserve l'ordre de mission et anticipe la traçabilité RNQ de la sous-traitance", () => {
  assert.match(checklist, /indicators: "27"[\s\S]*Ordres de mission/);
  assert.match(checklist, /indicators: "27"[\s\S]*pièce contractuelle associée à l’ordre de mission[\s\S]*référentiel national qualité/);
});

test("Studio affiche séparément les preuves actuelles et les exigences à venir", () => {
  assert.match(page, /item\.evidence\.map/);
  assert.match(page, /item\.upcomingRequirement/);
  assert.match(page, /item\.upcomingRequirement\.effectiveFrom/);
  assert.match(page, /item\.upcomingRequirement\.reference/);
});
