import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Studio AP2 analyse une inscription strictement dans le périmètre agent", async () => {
  const route = await read("src/app/agent/api/daily/sessions/[id]/posttraining-analysis/route.ts");
  assert.match(route, /requireSupportAgent\(\)/);
  assert.match(route, /isDailyOrganisationInAgentScope\(auth\.email, session\.organisation_id\)/);
  assert.match(route, /eq\("organisation_id", session\.organisation_id\)/);
  assert.match(route, /eq\("session_id", sessionId\)/);
  assert.match(route, /eq\("id", enrolmentId\)/);
  assert.match(route, /\["declined", "cancelled", "abandoned"\]/);
});

test("Studio AP2 exige une source réelle et sauvegarde idempotemment l'analyse structurée", async () => {
  const route = await read("src/app/agent/api/daily/sessions/[id]/posttraining-analysis/route.ts");
  assert.match(route, /daily_learning_assessments/);
  assert.match(route, /daily_learner_feedback_responses/);
  assert.match(route, /Aucune évaluation ni satisfaction/);
  assert.match(route, /daily_posttraining_analyses/);
  assert.match(route, /onConflict: "organisation_id,session_id,enrolment_id"/);
  for (const field of ["strengths", "weaknesses", "vigilance", "summary", "action_required"]) {
    assert.match(route, new RegExp(field));
  }
});

test("l'écran Satisfaction conserve les sources et permet l'analyse par apprenant", async () => {
  const [page, form] = await Promise.all([
    read("src/app/agent/daily/session-dossiers/[id]/satisfaction/page.tsx"),
    read("src/app/agent/daily/session-dossiers/[id]/satisfaction/PosttrainingAnalysisForm.tsx"),
  ]);
  assert.match(page, /daily_posttraining_analyses/);
  assert.doesNotMatch(page, /daily_learning_assessments/);
  assert.match(page, /vue dédiée aux évaluations des acquis/);
  assert.match(page, /PosttrainingAnalysisForm/);
  assert.match(form, /Points forts/);
  assert.match(form, /Points faibles ou difficultés/);
  assert.match(form, /Vigilance ou action à suivre/);
  assert.match(form, /Une action humaine ou une vigilance reste nécessaire/);
});

test("le schéma partagé protège unicité, parent actif et lecture autorisée", async () => {
  const migration = await read("supabase/migrations/20261008131200_daily_posttraining_analysis.sql");
  assert.match(migration, /unique \(organisation_id, session_id, enrolment_id\)/);
  assert.match(migration, /status not in \('declined', 'cancelled', 'abandoned'\)/);
  assert.match(migration, /daily_is_selen_staff\(\)/);
  assert.match(migration, /can_manage_daily_sessions\(organisation_id\)/);
});
