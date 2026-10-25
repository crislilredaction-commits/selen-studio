import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const assessmentEligibility = readFileSync(new URL("../src/lib/server/dailyPosttrainingAssessmentEligibility.ts", import.meta.url), "utf8");
const source = readFileSync(
  new URL("../src/app/agent/daily/session-dossiers/[id]/satisfaction/page.tsx", import.meta.url),
  "utf8",
);

test("la satisfaction Studio reste bornée au périmètre de l'agent et aux apprenants de l'OF", () => {
  const scope = source.indexOf("await isDailyOrganisationInAgentScope(auth.email, session.organisation_id)");
  const reads = source.indexOf("const [stakeholderRes, enrolmentRes, learnerFeedbackRes, analysisRes]");
  assert.ok(scope >= 0 && reads > scope, "Les données personnelles ne sont lues qu'après contrôle du périmètre");
  assert.match(source, /\.select\("id,learner_id,daily_learners\(id,organisation_id,email,first_name,last_name\)"\)\.eq\("organisation_id", session\.organisation_id\)/);
  assert.match(source, /learner\?\.organisation_id === session\.organisation_id && learner\.id === enrolment\.learner_id/);
  assert.match(source, /\.select\("enrolment_id,overall_rating[^\n]*\.eq\("organisation_id", session\.organisation_id\)\.eq\("session_id", id\)/);
});

test("les compteurs ignorent les réponses orphelines, annulées ou dupliquées", () => {
  assert.match(source, /const enrolmentIds = new Set\(enrolments\.map\(\(row\) => row\.id\)\)/);
  assert.match(source, /\.filter\(\(row\) => enrolmentIds\.has\(row\.enrolment_id\)\)/);
  assert.match(source, /const learnerDone = feedbackByEnrolment\.size/);
  assert.match(source, /const finalizedAssessmentIds = new Set/);
});

test("une évaluation finale suffit à débloquer l'analyse post-formation même sans satisfaction", () => {
  assert.match(source, /getFinalizedDailyAssessmentEnrolmentIds\(admin, session\.organisation_id, id\)/);
  assert.match(assessmentEligibility, /\.from\("daily_learning_assessments"\)/);
  assert.match(assessmentEligibility, /\.eq\("organisation_id", organisationId\)\.eq\("session_id", sessionId\)/);
  assert.match(assessmentEligibility, /row\.outcome !== "pending"/);
  assert.match(source, /enabled=\{Boolean\(feedback\) \|\| assessmentFinalized\}/);
  assert.doesNotMatch(source, /daily_learning_assessments/);
});
