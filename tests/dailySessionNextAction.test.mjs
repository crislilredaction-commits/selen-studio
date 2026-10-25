import assert from "node:assert/strict";
import test from "node:test";
import { resolveSessionWorkspaceNextAction } from "../src/lib/daily/sessionWorkspaceNextAction.mjs";

const base = {
  sessionId: "session test/1", dossierClosed: false, programNeedsReview: false,
  documentsNeedReview: false, documentsUnavailable: false, registrationNeedsReview: false,
  adaptationNeeded: false, responsesCount: 0, waitingForRegistration: false,
  pendingAttendanceReviews: 0, regularizationCount: 0, portalAccessUnavailable: false,
  openFollowups: 0, sessionFinished: false, activeLearners: 2,
  afterUnavailable: false, completedAssessments: 0, satisfactionCount: 0,
};
const resolve = (changes = {}) => resolveSessionWorkspaceNextAction({ ...base, ...changes });

test("les actions de préparation priment sur les étapes ultérieures", () => {
  assert.match(resolve({ programNeedsReview: true, pendingAttendanceReviews: 2 }).title, /Programme/);
  assert.match(resolve({ documentsNeedReview: true, pendingAttendanceReviews: 2 }).title, /Documents/);
  assert.equal(resolve({ documentsNeedReview: true, documentsUnavailable: true }).indicator, "État inconnu");
  assert.match(resolve({ registrationNeedsReview: true, adaptationNeeded: true, responsesCount: 2 }).text, /2 réponses/);
});

test("les preuves tardives restent une décision humaine prioritaire", () => {
  const action = resolve({ pendingAttendanceReviews: 2, regularizationCount: 3, openFollowups: 1 });
  assert.match(action.title, /Preuves de présence/);
  assert.match(action.text, /décision humaine/);
  assert.equal(action.href, "/agent/daily/session-dossiers/session%20test%2F1/full#presences-a-valider");
});

test("une panne des accès bloque les suggestions de relance, sans masquer la revue humaine", () => {
  assert.equal(resolve({ portalAccessUnavailable: true, regularizationCount: 3 }).indicator, "État inconnu");
  assert.match(resolve({ portalAccessUnavailable: true, regularizationCount: 3 }).text, /Ne transmets aucun lien/);
  assert.match(resolve({ portalAccessUnavailable: true, pendingAttendanceReviews: 1 }).title, /Preuves/);
});

test("les suivis et régularisations sont proposés avant les résultats de fin", () => {
  assert.match(resolve({ regularizationCount: 1, sessionFinished: true }).title, /régulariser/);
  assert.match(resolve({ openFollowups: 1, sessionFinished: true }).title, /Suivis/);
});

test("l'après formation ne signale pas de faux manquants en cas d'erreur", () => {
  assert.match(resolve({ sessionFinished: true, afterUnavailable: true }).title, /indisponibles/);
  assert.equal(resolve({ sessionFinished: true, afterUnavailable: true }).indicator, "État inconnu");
  assert.match(resolve({ sessionFinished: true, completedAssessments: 1 }).title, /Évaluations/);
  assert.match(resolve({ sessionFinished: true, completedAssessments: 2, satisfactionCount: 1 }).title, /Satisfactions/);
  assert.match(resolve({ sessionFinished: true, completedAssessments: 2, satisfactionCount: 2 }).title, /Clôture/);
  assert.match(resolve({ sessionFinished: false, completedAssessments: 0 }).title, /Dossier en suivi/);
});

test("une session sans inscrit n'exige pas d'évaluations, et un dossier clôturé reste clôturé", () => {
  assert.match(resolve({ sessionFinished: true, activeLearners: 0, waitingForRegistration: true }).title, /En attente/);
  assert.equal(resolve({ waitingForRegistration: true }).indicator, "En attente");
  assert.match(resolve({ dossierClosed: true, pendingAttendanceReviews: 1 }).title, /clôturé/);
});
