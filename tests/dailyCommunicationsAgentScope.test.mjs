import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/app/agent/daily/communications/page.tsx", import.meta.url), "utf8");
const proof = readFileSync(new URL("../src/app/agent/daily/communications/proof/route.ts", import.meta.url), "utf8");
const documentRoute = readFileSync(new URL("../src/app/agent/daily/communications/document/route.ts", import.meta.url), "utf8");
const scope = readFileSync(new URL("../src/lib/server/dailyOrganisationScope.ts", import.meta.url), "utf8");

test("communications : authentification puis périmètre avant tout accès service-role", () => {
  const auth = page.indexOf("const auth = await requireSupportAgent()");
  const guard = page.indexOf("if (!auth.ok)", auth);
  const scopeCall = page.indexOf("getDailyOrganisationIdsForAgent(auth.email)", guard);
  const admin = page.indexOf("createSupabaseAdminClient()", scopeCall);
  assert.ok(auth >= 0 && auth < guard && guard < scopeCall && scopeCall < admin);
});

test("communications : refus fermé en cas d'erreur ou d'absence d'affectation", () => {
  assert.match(page, /try \{[\s\S]*getDailyOrganisationIdsForAgent\(auth\.email\)[\s\S]*\} catch \{/);
  assert.match(page, /Impossible de vérifier votre périmètre Daily/);
  assert.match(page, /if \(dailyOrganisationIds\.length === 0\)[\s\S]*Aucun organisme Daily affecté/);
  assert.ok(page.indexOf("if (dailyOrganisationIds.length === 0)") < page.indexOf("createSupabaseAdminClient()"));
});

test("communications : consultation générale bornée avant tri et limite", () => {
  assert.match(page, /\.from\("daily_communications"\)[\s\S]*?\.in\("organisation_id", dailyOrganisationIds\)[\s\S]*?\.order\("created_at"/);
  assert.match(page, /\.limit\(200\)/);
});

test("communications : une session explicitement demandée est bornée au même périmètre", () => {
  assert.match(page, /\.from\("daily_sessions"\)\.select\("id,organisation_id"\)\.eq\("id", sessionId\)\.in\("organisation_id", dailyOrganisationIds\)/);
  assert.match(page, /Session introuvable ou non autorisée/);
  assert.doesNotMatch(page, /isDailyOrganisationInAgentScope/);
});

test("communications : signatures même non envoyées limitées aux sessions affectées", () => {
  assert.match(page, /scopedSignatureSessions[\s\S]*?\.from\("daily_sessions"\)[\s\S]*?\.in\("organisation_id", dailyOrganisationIds\)/);
  assert.match(page, /signatureSessionIds\.length[\s\S]*?\.from\("daily_convention_signatures"\)[\s\S]*?\.in\("session_id", signatureSessionIds\)/);
  assert.match(page, /Promise\.resolve\(\{ data: \[\] as SignatureRow\[\], error: null \}\)/);
});

test("communications : métadonnées des sessions secondaires bornées aux affectations", () => {
  assert.match(page, /\.select\("id,internal_reference,formation_id"\)\.in\("id", sessionIds\)\.in\("organisation_id", dailyOrganisationIds\)/);
  assert.doesNotMatch(page, /\.(?:insert|update|upsert|delete)\(/);
});

test("preuve PDF : l'accès à l'organisme est vérifié avant lecture des pièces", () => {
  assert.match(proof, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(proof, /if \(dailyOrganisationIds\.length === 0\)/);
  assert.match(proof, /\.from\("daily_communications"\)[\s\S]*?\.in\("organisation_id", dailyOrganisationIds\)[\s\S]*?\.maybeSingle\(\)/);
  assert.ok(proof.indexOf('.in("organisation_id", dailyOrganisationIds)') < proof.indexOf('.from("daily_communication_documents")'));
});

test("pièce jointe : vérification de la communication avant le snapshot et le stockage", () => {
  assert.match(documentRoute, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(documentRoute, /if \(dailyOrganisationIds\.length === 0\)/);
  assert.match(documentRoute, /\.from\("daily_communications"\)[\s\S]*?\.in\("organisation_id", dailyOrganisationIds\)/);
  assert.match(documentRoute, /if \(!allowedCommunication\)[\s\S]*?404/);
  assert.ok(documentRoute.indexOf("if (!allowedCommunication)") < documentRoute.indexOf('.from("daily_communication_documents")'));
  assert.ok(documentRoute.indexOf("if (!allowedCommunication)") < documentRoute.indexOf(".download(snapshot.storage_path)"));
});

test("les droits admin et les affectations agents restent ceux de la source canonique", () => {
  assert.match(scope, /adminUser\?\.role === "admin" \|\| profile\?\.role === "admin"/);
  assert.match(scope, /\.eq\("agent_profile_id", profile\.id\)/);
  assert.match(scope, /activeSet\.has\(organisationId\)/);
});
