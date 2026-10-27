import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  LEARNER_VIEWS, normalizeLearnerSearch, normalizeLearnerView,
  matchesLearnerSearch, countLearnerViews, filterLearnerEnrolments,
  prioritizeLearnerEnrolments,
} from "../src/lib/daily/dailyLearnerTriage.mjs";

const page = readFileSync(new URL("../src/app/agent/daily/learners/page.tsx", import.meta.url), "utf8");
const row = (id, overrides = {}) => ({
  id, status: "pending", positioning_status: "reviewed", prerequisites_status: "met",
  daily_learners: { first_name: "Éloïse", last_name: "Martin", email: "eloise@example.test" },
  organisations: { name: "Académie A" },
  daily_sessions: { internal_reference: "SES-2026", daily_formations: { title: "Formation pilote" } },
  ...overrides,
});
const data = [
  row("ok", { status: "confirmed" }),
  row("positioning", { positioning_status: "sent" }),
  row("prerequisites", { prerequisites_status: "to_clarify" }),
  row("adaptation"),
];
const needs = new Map([["adaptation", { has_specific_needs: true }]]);

test("paramètres GET inconnus ou répétés : valeurs bornées et vue sûre", () => {
  assert.equal(normalizeLearnerView("unknown"), "all");
  assert.equal(normalizeLearnerView(["positioning", "all"]), "positioning");
  assert.equal(normalizeLearnerView({ toString() { throw new Error("unsafe"); } }), "all");
  assert.equal(normalizeLearnerSearch(["  Eloise  ", "ignored"]), "Eloise");
  assert.equal(normalizeLearnerSearch("x".repeat(100)).length, 80);
  assert.deepEqual(Object.keys(LEARNER_VIEWS), ["all", "adaptations", "prerequisites", "positioning", "confirmed"]);
});

test("recherche accent-insensible sur identité, OF, formation et référence", () => {
  for (const q of ["eloise", "MARTIN", "academie a", "formation pilote", "ses-2026"]) {
    assert.equal(matchesLearnerSearch(data[0], q), true, q);
  }
  assert.equal(matchesLearnerSearch(data[0], "organisme étranger"), false);
});

test("compteurs et filtres distincts après le périmètre agent", () => {
  assert.deepEqual(countLearnerViews(data, needs), {
    all: 4, adaptations: 1, prerequisites: 1, positioning: 1, confirmed: 1,
  });
  assert.deepEqual(filterLearnerEnrolments(data, "", "adaptations", needs).map(r => r.id), ["adaptation"]);
  assert.deepEqual(filterLearnerEnrolments(data, "", "prerequisites", needs).map(r => r.id), ["prerequisites"]);
  assert.deepEqual(filterLearnerEnrolments(data, "", "positioning", needs).map(r => r.id), ["positioning"]);
  assert.deepEqual(filterLearnerEnrolments(data, "", "confirmed", needs).map(r => r.id), ["ok"]);
  assert.deepEqual(filterLearnerEnrolments(data, "aucun", "all", needs), []);
});

test("ordre opérationnel stable : adaptation, prérequis, positionnement, reste", () => {
  assert.deepEqual(prioritizeLearnerEnrolments(data, needs).map(r => r.id), [
    "adaptation", "prerequisites", "positioning", "ok",
  ]);
  assert.deepEqual(prioritizeLearnerEnrolments([row("first"), row("second")]).map(r => r.id), ["first", "second"]);
});

test("la page ne recherche qu'après le bornage serveur et conserve les historiques séparés", () => {
  assert.match(page, /requireSupportAgent\(\)/);
  assert.match(page, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(page, /\.in\("organisation_id", organisationIds\)/);
  assert.match(page, /const activeEnrolments = allEnrolments\.filter/);
  assert.match(page, /const historicalEnrolments = allEnrolments\.filter/);
  assert.match(page, /filterLearnerEnrolments\(prioritizedActiveEnrolments/);
  assert.match(page, /filterLearnerEnrolments\(scopedHistoricalEnrolments/);
  assert.match(page, /filterLearnerOrganisation\(historicalEnrolments, selectedOrganisation\.id\)/);
  assert.match(page, /name="q"/);
  assert.match(page, /name="vue"/);
  assert.match(page, /role="status"/);
  assert.match(page, /Impossible de vérifier votre périmètre Daily/);
  assert.doesNotMatch(page, /getActiveDailyOrganisationIds/);
});
