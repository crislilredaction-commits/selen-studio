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

test("l'indicateur 19 anticipe la preuve du suivi à distance et le référent pédagogique conditionnel", () => {
  assert.match(checklist, /indicators: "19"[\s\S]*effectivité du suivi par chaque apprenant/);
  assert.match(checklist, /indicators: "19"[\s\S]*seuil d’intervenants fixé par arrêté[\s\S]*référent pédagogique/);
});

test("l'indicateur 27 conserve l'ordre de mission et anticipe la traçabilité RNQ de la sous-traitance", () => {
  assert.match(checklist, /indicators: "27"[\s\S]*Ordres de mission/);
  assert.match(checklist, /indicators: "27"[\s\S]*pièce contractuelle associée à l’ordre de mission[\s\S]*référentiel national qualité/);
});

test("l'indicateur 32 anticipe l'analyse des risques qualité", () => {
  assert.match(checklist, /indicators: "31 \/ 32"[\s\S]*Analyse documentée des risques[\s\S]*qualité des formations/);
  assert.match(checklist, /risques identifiés[\s\S]*actions d’amélioration continue/);
});

test("le nouvel indicateur 33 reste borné à l'apprentissage", () => {
  assert.match(checklist, /indicators: "33"/);
  assert.match(checklist, /Apprentissage uniquement/);
  assert.match(checklist, /4° de l’article L\. 6313-1/);
  assert.match(checklist, /distincte du questionnaire général de satisfaction/);
  assert.match(checklist, /Résultats partagés avec les équipes pédagogiques/);
  assert.match(checklist, /mesure périodique de son efficacité/);
});

test("Studio affiche séparément les preuves actuelles et les exigences à venir", () => {
  assert.match(page, /item\.evidence\.map/);
  assert.match(page, /item\.upcomingRequirement/);
  assert.match(page, /item\.upcomingRequirement\.effectiveFrom/);
  assert.match(page, /item\.upcomingRequirement\.reference/);
});
