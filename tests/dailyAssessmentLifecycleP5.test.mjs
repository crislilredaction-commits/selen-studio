import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Studio exposes a scoped assessment screen distinct from satisfaction", async () => {
  const [evaluation, satisfaction, dossier] = await Promise.all([
    read("src/app/agent/daily/session-dossiers/[id]/evaluation/page.tsx"),
    read("src/app/agent/daily/session-dossiers/[id]/satisfaction/page.tsx"),
    read("src/app/agent/daily/session-dossiers/[id]/page.tsx"),
  ]);
  assert.match(evaluation, /isDailyOrganisationInAgentScope/);
  assert.match(evaluation, /Résultats finalisés/);
  assert.match(evaluation, /Une réponse transmise ou une preuve importée ne vaut pas résultat final/);
  assert.match(evaluation, /learning_assessment_evidence/);
  assert.doesNotMatch(satisfaction, /daily_learning_assessments/);
  assert.match(satisfaction, /vue dédiée aux évaluations des acquis/);
  assert.match(dossier, /Évaluation finale des acquis/);
});

test("Studio evidence download keeps organisation and storage boundaries", async () => {
  const route = await read("src/app/agent/api/daily/learning-assessment-evidence/download/route.ts");
  assert.match(route, /getDailyOrganisationIdsForAgent/);
  assert.match(route, /learning_assessment_evidence/);
  assert.match(route, /eq\("is_current", true\)/);
  assert.match(route, /storage_path\?\.startsWith/);
  assert.match(route, /createSignedUrl/);
});
