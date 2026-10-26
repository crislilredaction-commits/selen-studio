import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const page = () => readFile(new URL("../src/app/agent/daily/revues-formateurs/page.tsx", import.meta.url), "utf8");
const scope = () => readFile(new URL("../src/lib/server/dailyOrganisationScope.ts", import.meta.url), "utf8");

test("bilans formateurs : authentification avant périmètre et lecture service-role", async () => {
  const source = await page();
  const auth = source.indexOf("const auth = await requireSupportAgent()");
  const guard = source.indexOf("if (!auth.ok)");
  const scopeCall = source.indexOf("getDailyOrganisationIdsForAgent(auth.email)");
  const firstRead = source.indexOf('.from("daily_trainer_profiles")');
  assert.ok(auth >= 0 && auth < guard && guard < scopeCall && scopeCall < firstRead);
  assert.doesNotMatch(source, /getActiveDailyOrganisationIds/);
});

test("bilans formateurs : résolution du périmètre en refus fermé", async () => {
  const source = await page();
  assert.match(source, /try \{[\s\S]*getDailyOrganisationIdsForAgent\(auth\.email\)[\s\S]*\} catch \{/);
  assert.match(source, /Impossible de vérifier votre périmètre Daily/);
  assert.match(source, /if \(dailyOrganisationIds\.length === 0\)[\s\S]*Aucun organisme Daily affecté/);
});

test("bilans formateurs : profils bornés aux organismes affectés", async () => {
  const source = await page();
  assert.match(source, /\.from\("daily_trainer_profiles"\)[\s\S]*?\.in\("organisation_id", dailyOrganisationIds\)/);
  assert.match(source, /\.eq\("active", true\)/);
  assert.match(source, /\.neq\("status", "archived"\)/);
});

test("bilans formateurs : bilans bornés aux seuls profils visibles", async () => {
  const source = await page();
  assert.match(source, /const trainerIds = \(trainers \?\? \[\]\)\.map/);
  assert.match(source, /trainerIds\.length\s*\? await admin[\s\S]*?\.from\("daily_trainer_annual_reviews"\)[\s\S]*?\.in\("trainer_profile_id", trainerIds\)/);
  assert.match(source, /: \{ data: \[\], error: null \}/);
});

test("bilans formateurs : droits administrateur conservés et aucune mutation métier", async () => {
  const [source, access] = await Promise.all([page(), scope()]);
  assert.match(access, /adminUser\?\.role === "admin" \|\| profile\?\.role === "admin"/);
  assert.match(access, /\.eq\("agent_profile_id", profile\.id\)/);
  assert.match(access, /activeSet\.has\(organisationId\)/);
  assert.doesNotMatch(source, /\.(?:insert|upsert|update|delete)\(/);
  assert.match(source, /review\?\.submitted_at && review\?\.manager_completed_at/);
});
