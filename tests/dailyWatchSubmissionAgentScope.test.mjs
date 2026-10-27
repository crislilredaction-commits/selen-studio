import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/app/agent/daily/veille-proposee/page.tsx", import.meta.url), "utf8");
const scope = await readFile(new URL("../src/lib/server/dailyOrganisationScope.ts", import.meta.url), "utf8");
const action = page.slice(page.indexOf("async function review("), page.indexOf("\nfunction fr("));
const view = page.slice(page.indexOf("export default async function WatchSubmissionReviewPage("), page.indexOf("\nconst s:"));

test("veilles proposées : accès Studio vérifié avant lecture service-role", () => {
  const auth = view.indexOf("const auth = await requireSupportAgent()");
  const deny = view.indexOf("if (!auth.ok)");
  const scopeCheck = view.indexOf("getDailyOrganisationIdsForAgent(auth.email)");
  const admin = view.indexOf("createSupabaseAdminClient()");
  assert.ok(auth >= 0 && auth < deny && deny < scopeCheck && scopeCheck < admin);
});

test("veilles proposées : liste des propositions limitée aux organismes affectés", () => {
  assert.match(view, /\.from\("daily_watch_submissions"\)[\s\S]*?\.eq\("status", "pending"\)[\s\S]*?\.in\("organisation_id", scopedOrganisationIds\)/);
  assert.match(view, /\.from\("organisations"\)[\s\S]*?\.in\("id", dailyOrganisationIds\)/);
  assert.ok(view.indexOf("if (selectedOrganisation === null)") < view.indexOf('.from("daily_watch_submissions")'));
  assert.match(view, /const scopedOrganisationIds = selectedOrganisation \? \[selectedOrganisation\] : organisationOptions\.map/);
  assert.doesNotMatch(view, /getActiveDailyOrganisationIds/);
});

test("veilles proposées : refus fermé si périmètre inaccessible ou vide", () => {
  assert.match(view, /catch \{[\s\S]*?Impossible de vérifier votre périmètre Daily/);
  assert.match(view, /if \(dailyOrganisationIds.length === 0\)/);
  assert.ok(view.indexOf("if (dailyOrganisationIds.length === 0)") < view.indexOf("createSupabaseAdminClient()"));
  assert.match(view, /if \(error\) return <main role="alert"/);
});

test("veilles proposées : validation et rejet exigent un agent authentifié", () => {
  const auth = action.indexOf("const auth = await requireSupportAgent()");
  const deny = action.indexOf("if (!auth.ok) return;");
  const admin = action.indexOf("createSupabaseAdminClient()");
  const insert = action.indexOf('.from("daily_watch_entries").insert(');
  assert.ok(auth >= 0 && auth < deny && deny < admin && admin < insert);
});

test("veilles proposées : une proposition hors affectation ne peut pas être publiée", () => {
  assert.match(action, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(action, /if \(dailyOrganisationIds.length === 0\) return/);
  assert.match(action, /\.from\("daily_watch_submissions"\)[\s\S]*?\.eq\("id", id\)[\s\S]*?\.in\("organisation_id", dailyOrganisationIds\)/);
  assert.match(action, /if \(submissionError \|\| !submission \|\| submission.status !== "pending"\) return/);
  assert.ok(action.indexOf('.in("organisation_id", dailyOrganisationIds)') < action.indexOf('.from("daily_watch_entries").insert('));
});

test("veilles proposées : la décision ne modifie que la proposition autorisée encore en attente", () => {
  assert.match(action, /\.update\(\{[\s\S]*?\}\)\.eq\("id", id\)\.eq\("organisation_id", submission.organisation_id\)\.eq\("status", "pending"\)/);
  assert.doesNotMatch(action, /getActiveDailyOrganisationIds/);
  assert.match(scope, /adminUser\?\.role === "admin" \|\| profile\?\.role === "admin"/);
});
