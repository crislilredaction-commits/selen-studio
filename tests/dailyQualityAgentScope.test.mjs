import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const quality = await readFile(new URL("../src/app/agent/daily/qualite/page.tsx", import.meta.url), "utf8");
const feedback = await readFile(new URL("../src/app/agent/daily/reclamations/page.tsx", import.meta.url), "utf8");
const scope = await readFile(new URL("../src/lib/server/dailyOrganisationScope.ts", import.meta.url), "utf8");

function actionSource(name) {
  const start = quality.indexOf(`async function ${name}(formData: FormData)`);
  assert.ok(start >= 0, `Action absente : ${name}`);
  const next = quality.indexOf("\nasync function ", start + 1);
  const end = next >= 0 ? next : quality.indexOf("\nfunction frDate", start);
  return quality.slice(start, end);
}

test("qualité : les deux actions serveur vérifient l'agent avant service-role et écriture", () => {
  for (const name of ["createWatch", "forceUsage"]) {
    const source = actionSource(name);
    const auth = source.indexOf("const auth = await requireSupportAgent()");
    const guard = source.indexOf("if (!auth.ok) return;");
    const admin = source.indexOf("createSupabaseAdminClient()");
    const write = Math.max(source.indexOf(".insert("), source.indexOf(".upsert("));
    assert.ok(auth >= 0 && auth < guard && guard < admin && admin < write, name);
  }
});

test("qualité : les améliorations restent limitées aux affectations, même pour 'all'", () => {
  const source = actionSource("forceUsage");
  assert.match(source, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(source, /target === "all"\s*\? dailyOrganisationIds/);
  assert.match(source, /dailyOrganisationIds\.includes\(target\)/);
  assert.match(source, /if \(organisationIds\.length === 0\) return/);
  assert.match(source, /organisationIds\.map\(\(organisation_id\)/);
  assert.doesNotMatch(source, /getActiveDailyOrganisationIds/);
});

test("qualité : une veille archivée ou inconnue ne peut être appliquée", () => {
  const source = actionSource("forceUsage");
  assert.match(source, /\.from\("daily_watch_entries"\)[\s\S]*?\.eq\("status", "active"\)\.maybeSingle\(\)/);
  assert.match(source, /if \(watchError \|\| !activeWatch\) return/);
  assert.ok(source.indexOf("if (watchError || !activeWatch) return;") < source.indexOf(".upsert("));
});

test("qualité : l'écran refuse les accès anonymes et les erreurs de périmètre avant lecture", () => {
  const auth = quality.indexOf("const auth = await requireSupportAgent()", quality.indexOf("export default async function"));
  const guard = quality.indexOf("if (!auth.ok)", auth);
  const scopeCall = quality.indexOf("getDailyOrganisationIdsForAgent(auth.email)", auth);
  const firstRead = quality.indexOf('from("organisations")', auth);
  assert.ok(auth >= 0 && auth < guard && guard < scopeCall && scopeCall < firstRead);
  assert.match(quality.slice(auth), /catch \{[\s\S]*?Impossible de vérifier votre périmètre Daily/);
  assert.match(quality, /if \(watchesError \|\| usagesError \|\| actionsError\)/);
});

test("qualité : les indicateurs, organismes et exploitation n'incluent pas d'autres OF", () => {
  assert.match(quality, /\.from\("organisations"\)[\s\S]*?\.in\("id", dailyOrganisationIds\)/);
  assert.match(quality, /\.from\("daily_organisation_watch_entries"\)[\s\S]*?\.in\("organisation_id", dailyOrganisationIds\)/);
  assert.match(quality, /\.from\("daily_quality_actions"\)[\s\S]*?\.in\("organisation_id", dailyOrganisationIds\)/);
  assert.match(quality, /Tous mes organismes Daily affectés/);
  assert.match(scope, /adminUser\?\.role === "admin" \|\| profile\?\.role === "admin"/);
});

test("réclamations : accès agent puis périmètre avant lecture service-role", () => {
  const auth = feedback.indexOf("const auth = await requireSupportAgent()");
  const guard = feedback.indexOf("if (!auth.ok)", auth);
  const scopeCall = feedback.indexOf("getDailyOrganisationIdsForAgent(auth.email)");
  const read = feedback.indexOf('from("daily_stakeholder_feedback")');
  assert.ok(auth >= 0 && auth < guard && guard < scopeCall && scopeCall < read);
  assert.match(feedback, /catch \{[\s\S]*?Impossible de vérifier votre périmètre Daily/);
  assert.match(feedback, /\.in\("organisation_id", scopedOrganisationIds\)/);
  assert.match(feedback, /if \(selectedOrganisation === null\)/);
  assert.ok(feedback.indexOf("if (selectedOrganisation === null)") < feedback.indexOf('from("daily_stakeholder_feedback")'));
  assert.match(feedback, /\.in\("id", organisationIds\)/);
  assert.doesNotMatch(feedback, /getActiveDailyOrganisationIds/);
});

test("réclamations : zéro organisme n'entraîne aucune lecture métier ni écriture", () => {
  assert.match(feedback, /organisationIds\.length\s*\?\s*await admin\.from\("organisations"\)/);
  assert.match(feedback, /scopedOrganisationIds\.length\s*\?\s*await admin\.from\("daily_stakeholder_feedback"\)/);
  assert.doesNotMatch(feedback, /\.(?:insert|upsert|update|delete)\(/);
});
