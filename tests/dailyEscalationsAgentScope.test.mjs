import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const page = () => readFile(new URL("../src/app/agent/daily/escalations/page.tsx", import.meta.url), "utf8");
const route = () => readFile(new URL("../src/app/agent/api/daily/escalations/route.ts", import.meta.url), "utf8");
const scope = () => readFile(new URL("../src/lib/server/dailyOrganisationScope.ts", import.meta.url), "utf8");

test("escalades : authentification puis périmètre avant la file métier", async () => {
  const source = await page();
  const auth = source.indexOf("const auth = await requireSupportAgent()");
  const guard = source.indexOf("if (!auth.ok)");
  const scopeCall = source.indexOf("getDailyOrganisationIdsForAgent(auth.email)");
  const firstEscalation = source.indexOf('.from("daily_work_escalations")');
  assert.ok(auth >= 0 && auth < guard && guard < scopeCall && scopeCall < firstEscalation);
});

test("escalades : une erreur de résolution refuse l'accès sans divulguer de données", async () => {
  const source = await page();
  assert.match(source, /try \{[\s\S]*getDailyOrganisationIdsForAgent\(auth\.email\)[\s\S]*\} catch \{[\s\S]*Impossible de vérifier votre périmètre Daily/);
  assert.match(source, /if \(!isAdmin\) query = query\.eq\("escalated_by", profile\.id\)\.in\("organisation_id", organisationIds\)/);
  assert.match(source, /isAdmin \|\| organisationIds\.length \? await query : \{ data: \[\], error: null \}/);
});

test("escalades : lien direct vers un dossier borné à l'OF et à la session", async () => {
  const source = await page();
  assert.match(source, /if \(sessionId && \(isAdmin \|\| organisationIds\.length\)\)/);
  assert.match(source, /sessionQuery = sessionQuery\.in\("organisation_id", organisationIds\)/);
  assert.match(source, /organisationIds\.includes\(session\.organisation_id\)/);
  assert.match(source, /\.from\("daily_session_dossiers"\)[\s\S]*?\.eq\("session_id", sessionId\)\.eq\("organisation_id", session\.organisation_id\)/);
});

test("escalades : une tâche partagée hors organisme ne devient pas escaladable", async () => {
  const source = await page();
  assert.match(source, /organisationIds\.includes\(item\.organisationId\)/);
  assert.match(source, /canTreatDailyPilotageTask\(item/);
  assert.match(source, /taskKey && \(isAdmin \|\| organisationIds\.length\)/);
});

test("escalades : POST création vérifie le périmètre avant toute insertion", async () => {
  const source = await route();
  const auth = source.indexOf("const auth = await requireSupportAgent()");
  const scopeCall = source.indexOf("getDailyOrganisationIdsForAgent(auth.email)");
  const firstInsert = source.indexOf('.insert({');
  assert.ok(auth >= 0 && auth < scopeCall && scopeCall < firstInsert);
  assert.match(source, /if \(!isAdmin && !organisationIds\.includes\(task\.organisationId\)\)/);
  assert.match(source, /Impossible de vérifier votre périmètre Daily/);
});

test("escalades : POST dossier refuse une session étrangère même sans agent assigné", async () => {
  const source = await route();
  assert.match(source, /if \(!isAdmin && organisationIds\.length === 0\)/);
  assert.match(source, /sessionQuery = sessionQuery\.in\("organisation_id", organisationIds\)/);
  assert.match(source, /!organisationIds\.includes\(session\.organisation_id\)/);
  assert.match(source, /\.eq\("organisation_id", session\.organisation_id\)/);
  assert.match(source, /dossier\.assigned_agent_profile_id !== profile\.id/);
});

test("escalades : l'administrateur conserve la file et les actions, sans mutation en GET", async () => {
  const [source, post, access] = await Promise.all([page(), route(), scope()]);
  assert.match(source, /if \(!isAdmin\) query/);
  assert.match(source, /isAdmin \? "File admin et historique" : "Mes escalades"/);
  assert.match(post, /if \(!isAdmin\) return back\(request, "error", "Action réservée aux administrateurs\."\)/);
  assert.match(access, /adminUser\?\.role === "admin" \|\| profile\?\.role === "admin"/);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});
