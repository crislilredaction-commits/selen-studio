import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pretrainingRoute = readFileSync(new URL("../src/app/agent/api/daily/pretraining-documents/route.ts", import.meta.url), "utf8");
const posttrainingRoute = readFileSync(new URL("../src/app/agent/api/daily/posttraining-documents/route.ts", import.meta.url), "utf8");
const pretrainingDownload = readFileSync(new URL("../src/app/agent/api/daily/pretraining-documents/download/route.ts", import.meta.url), "utf8");
const posttrainingDownload = readFileSync(new URL("../src/app/agent/api/daily/posttraining-documents/download/route.ts", import.meta.url), "utf8");
const pretrainingPage = readFileSync(new URL("../src/app/agent/daily/pretraining-documents/page.tsx", import.meta.url), "utf8");
const posttrainingPage = readFileSync(new URL("../src/app/agent/daily/posttraining-documents/page.tsx", import.meta.url), "utf8");

for (const [label, source] of [["préformation", pretrainingRoute], ["fin de formation", posttrainingRoute]]) {
  test(`les documents ${label} réutilisent le périmètre canonique de l'agent Daily`, () => {
    assert.match(source, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
    assert.doesNotMatch(source, /getActiveDailyOrganisationIds/);
    assert.match(source, /\.from\("daily_documents"\)[\s\S]*\.in\("organisation_id",\s*organisationIds\)/);
  });

  test(`le PATCH ${label} borne aussi la recherche du document à l'organisme assigné`, () => {
    const patchSource = source.split("export async function PATCH")[1] ?? "";
    assert.match(patchSource, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
    assert.match(patchSource, /\.eq\("id",\s*id\)[\s\S]*\.in\("organisation_id",\s*organisationIds\)/);
  });

  test(`un périmètre agent Daily vide ne déclenche pas de lecture globale ${label}`, () => {
    assert.match(source, /organisationIds\.length\s*===\s*0/);
  });
}

for (const [label, source] of [["préformation", pretrainingDownload], ["fin de formation", posttrainingDownload]]) {
  test(`la consultation ${label} reste bornée au périmètre canonique de l'agent`, () => {
    assert.match(source, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
    assert.match(source, /organisationIds\.length\s*===\s*0/);
    assert.match(source, /\.eq\("id",\s*id\)[\s\S]*\.in\("organisation_id",\s*organisationIds\)/);
    assert.match(source, /createSignedUrl\(document\.storage_path,120\)/);
  });
}

test("Studio demande explicitement d'ouvrir la pièce avant décision", () => {
  for (const page of [pretrainingPage, posttrainingPage]) {
    assert.match(page, /Ouvrir la pièce/);
    assert.match(page, /avant/);
    assert.match(page, /Valider|valider/);
  }
});
