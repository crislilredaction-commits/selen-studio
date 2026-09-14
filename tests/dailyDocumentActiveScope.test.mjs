import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pretrainingRoute = readFileSync(new URL("../src/app/agent/api/daily/pretraining-documents/route.ts", import.meta.url), "utf8");
const posttrainingRoute = readFileSync(new URL("../src/app/agent/api/daily/posttraining-documents/route.ts", import.meta.url), "utf8");

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
