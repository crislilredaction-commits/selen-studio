import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dailySatisfactionLearnerProgress } from "../src/lib/daily/dailySatisfactionLearnerProgress.mjs";

const session = "session-a";
const active = (id, status = "confirmed", session_id = session) => ({ id, session_id, status });
const response = (enrolment_id, session_id = session) => ({ enrolment_id, session_id });

test("satisfaction : réponses uniques pour inscriptions actives de la session", () => {
  assert.deepEqual(dailySatisfactionLearnerProgress(
    [active("a"), active("b")],
    [response("a"), response("a"), response("b")], session),
    { expectedLearners: 2, learnerDone: 2, missingLearners: 0, learnerComplete: true });
});

test("satisfaction : une réponse d'inscription annulée ne cache pas une réponse manquante", () => {
  const result = dailySatisfactionLearnerProgress(
    [active("a"), active("b", "cancelled"), active("c", "canceled"), active("d", "declined"), active("e", "abandoned")],
    [response("b"), response("c"), response("d"), response("e")], session);
  assert.deepEqual(result, { expectedLearners: 1, learnerDone: 0, missingLearners: 1, learnerComplete: false });
});

test("satisfaction : réponse hors session et inscription étrangère ignorées", () => {
  assert.deepEqual(dailySatisfactionLearnerProgress(
    [active("a"), active("b", "confirmed", "session-b")],
    [response("a", "session-b"), response("b"), response("inconnue")], session),
    { expectedLearners: 1, learnerDone: 0, missingLearners: 1, learnerComplete: false });
});

test("satisfaction : zéro inscription active ne devient pas artificiellement complet", () => {
  assert.deepEqual(dailySatisfactionLearnerProgress([active("a", "abandoned")], [response("a")], session),
    { expectedLearners: 0, learnerDone: 0, missingLearners: 0, learnerComplete: false });
});

test("satisfaction : statuts normalisés et inscriptions dupliquées comptées une seule fois", () => {
  assert.deepEqual(dailySatisfactionLearnerProgress(
    [active("a", " CONFIRMED "), active("a"), active("b", " Cancelled ")],
    [response("a"), response("b")], session),
    { expectedLearners: 1, learnerDone: 1, missingLearners: 0, learnerComplete: true });
});

test("satisfaction : le tableau conserve les gardes d'accès et affiche le reste à obtenir", async () => {
  const source = await readFile(new URL("../src/app/agent/daily/satisfaction/page.tsx", import.meta.url), "utf8");
  assert.match(source, /requireSupportAgent\(\)/);
  assert.match(source, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(source, /dailySatisfactionLearnerProgress\(enrolments, learnerFeedback, session\.id\)/);
  assert.match(source, /Réponses apprenants manquantes/);
  assert.match(source, /row\.missingLearners/);
  for (const table of ["daily_sessions", "daily_session_enrolments", "daily_learner_feedback_responses", "daily_stakeholder_satisfaction_responses"]) {
    assert.match(source, new RegExp('\\.from\\("'+table+'"\\)[\\s\\S]*?\\.in\\("organisation_id", organisationIds\\)'));
  }
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});
