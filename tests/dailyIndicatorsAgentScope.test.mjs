import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const page = () => readFile(new URL("../src/app/agent/daily/indicateurs/page.tsx", import.meta.url), "utf8");
const scope = () => readFile(new URL("../src/lib/server/dailyOrganisationScope.ts", import.meta.url), "utf8");

test("indicateurs : authentification avant résolution du périmètre et avant toute lecture métier", async () => {
  const source = await page();
  const auth = source.indexOf("const auth = await requireSupportAgent()");
  const guard = source.indexOf("if (!auth.ok)");
  const scopeCall = source.indexOf("getDailyOrganisationIdsForAgent(auth.email)");
  const firstRead = source.indexOf('.from("organisations")');
  assert.ok(auth >= 0 && auth < guard && guard < scopeCall && scopeCall < firstRead);
  assert.doesNotMatch(source, /getActiveDailyOrganisationIds/);
});

test("indicateurs : échec de périmètre = refus fermé sans requête métier", async () => {
  const source = await page();
  assert.match(source, /try \{[\s\S]*getDailyOrganisationIdsForAgent\(auth\.email\)[\s\S]*\} catch \{[\s\S]*Impossible de vérifier votre périmètre Daily/);
  assert.match(source, /if \(!auth\.ok\) return <main role="alert"/);
});

test("indicateurs : sept lectures métier limitées aux organismes autorisés", async () => {
  const source = await page();
  for (const [table, key] of [
    ["organisations", "id"],
    ["daily_sessions", "organisation_id"],
    ["daily_session_enrolments", "organisation_id"],
    ["daily_attendance_records", "organisation_id"],
    ["daily_learning_assessments", "organisation_id"],
    ["daily_learner_feedback_responses", "organisation_id"],
    ["daily_stakeholder_satisfaction_responses", "organisation_id"],
  ]) {
    const start = source.indexOf('.from("' + table + '")');
    assert.ok(start >= 0, table);
    assert.match(source.slice(start, start + 180), new RegExp('\\.in\\("' + key + '", organisationIds\\)'), table);
  }
});

test("indicateurs : zéro OF autorisé signifie zéro lecture métier et aucune donnée exposée", async () => {
  const source = await page();
  assert.match(source, /organisationIds\.length\s*\?\s*await Promise\.all/);
  assert.match(source, /: \[[\s\S]*\{ data: \[\], error: null \}/);
  assert.match(source, /if \(error\)/);
  assert.match(source, /organisations\.length === 0/);
});

test("indicateurs : administrateurs globaux, agents bornés, statistiques en lecture seule", async () => {
  const [source, access] = await Promise.all([page(), scope()]);
  assert.match(access, /adminUser\?\.role === "admin" \|\| profile\?\.role === "admin"/);
  assert.match(access, /\.eq\("agent_profile_id", profile\.id\)/);
  assert.match(access, /activeSet\.has\(organisationId\)/);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  assert.match(source, /percent\(presentAttendance\.length, decidedAttendance\.length\)/);
  assert.match(source, /average\(\[\.\.\.learnerFeedback/);
});
