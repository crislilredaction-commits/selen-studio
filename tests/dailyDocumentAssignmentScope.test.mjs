import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scope = await readFile(new URL("../src/lib/server/dailyOrganisationScope.ts", import.meta.url), "utf8");
const pretraining = await readFile(new URL("../src/app/agent/api/daily/pretraining-documents/route.ts", import.meta.url), "utf8");
const posttraining = await readFile(new URL("../src/app/agent/api/daily/posttraining-documents/route.ts", import.meta.url), "utf8");
const pretrainingDownload = await readFile(new URL("../src/app/agent/api/daily/pretraining-documents/download/route.ts", import.meta.url), "utf8");
const conventionDownload = await readFile(new URL("../src/app/agent/api/daily/conventions/download/route.ts", import.meta.url), "utf8");
const convocationDownload = await readFile(new URL("../src/app/agent/api/daily/convocations/download/route.ts", import.meta.url), "utf8");

test("le périmètre Daily d'un agent vient de l'assignation organisme", () => {
  assert.match(scope, /getDailyOrganisationIdsForAgent/);
  assert.match(scope, /from\("daily_organisation_assignments"\)/);
  assert.match(scope, /eq\("agent_profile_id",\s*profile\.id\)/);
  assert.match(scope, /adminUser\?\.role === "admin" \|\| profile\?\.role === "admin"/);
  assert.match(scope, /activeSet\.has\(organisationId\)/);
});

test("les listes et actions Avant/Après utilisent le périmètre de l'agent", () => {
  for (const source of [pretraining, posttraining]) {
    assert.match(source, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
    assert.match(source, /\.in\("organisation_id",\s*organisationIds\)/);
    assert.doesNotMatch(source, /getActiveDailyOrganisationIds\(\)/);
  }
});

test("les téléchargements Daily refusent un document hors assignation", () => {
  assert.match(pretrainingDownload, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(pretrainingDownload, /\.in\("organisation_id",\s*organisationIds\)/);

  for (const source of [conventionDownload, convocationDownload]) {
    assert.match(source, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
    assert.match(source, /from\("daily_sessions"\)/);
    assert.match(source, /\.in\("organisation_id",\s*organisationIds\)/);
    assert.match(source, /if \(!session\) return NextResponse\.json/);
  }
});
