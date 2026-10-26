import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/app/agent/daily/preaudit/page.tsx", import.meta.url), "utf8");
const helper = await readFile(new URL("../src/lib/server/dailyQualiopiPreaudit.ts", import.meta.url), "utf8");
const scope = await readFile(new URL("../src/lib/server/dailyOrganisationScope.ts", import.meta.url), "utf8");

test("pré-audit : contrôle agent puis périmètre avant tout accès métier", () => {
  const auth = page.indexOf("const auth=await requireSupportAgent()");
  const check = page.indexOf("if(!auth.ok)");
  const scopeCall = page.indexOf("getDailyOrganisationIdsForAgent(auth.email)");
  const targets = page.indexOf("getQualiopiPreauditOrganisations(dailyOrganisationIds)");
  const admin = page.indexOf("createSupabaseAdminClient()");
  assert.ok(auth >= 0 && auth < check && check < scopeCall && scopeCall < targets && targets < admin);
});

test("pré-audit : refuse la lecture si périmètre indisponible ou vide", () => {
  assert.match(page, /catch \{[\s\S]*Impossible de vérifier votre périmètre Daily/);
  assert.match(page, /if \(!dailyOrganisationIds\.length\)[\s\S]*Aucun organisme Daily affecté/);
  assert.match(page, /getQualiopiPreauditOrganisations\(dailyOrganisationIds\)/);
});

test("pré-audit : le helper utilise exclusivement le périmètre fourni", () => {
  assert.match(helper, /allowedOrganisationIds === undefined[\s\S]*getActiveDailyOrganisationIds\(\)[\s\S]*new Set\(allowedOrganisationIds\.filter\(Boolean\)\)/);
  assert.match(helper, /if \(!ids\.length\) return \[\]/);
  assert.match(helper, /\.from\("organisations"\)[\s\S]*?\.in\("id", ids\)/);
});

test("pré-audit : toutes les lectures secondaires sont bornées aux organismes visibles", () => {
  assert.match(page, /const ids=targets\.map\(x=>x\.id\)/);
  for (const table of ["daily_sessions", "daily_documents", "daily_internal_procedures", "daily_business_watch_entries", "daily_trainer_profiles"]) {
    assert.match(page, new RegExp('\\.from\\("'+table+'"\\)[\\s\\S]*?\\.in\\("organisation_id",ids\\)'));
  }
  assert.match(page, /getCommunicationEvidenceCheck\(target\.id,session\.id\)/);
  assert.doesNotMatch(page, /getActiveDailyOrganisationIds/);
  assert.doesNotMatch(page, /\.(?:insert|update|delete|upsert)\(/);
});

test("pré-audit : administrateurs et affectations conservent le périmètre canonique", () => {
  assert.match(scope, /adminUser\?\.role === "admin" \|\| profile\?\.role === "admin"/);
  assert.match(scope, /\.eq\("agent_profile_id", profile\.id\)/);
  assert.match(scope, /activeSet\.has\(organisationId\)/);
});
