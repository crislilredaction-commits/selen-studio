import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { filterDailySatisfactionRows, normalizeDailySatisfactionQuery, normalizeDailySatisfactionView } from "../src/lib/daily/dailySatisfactionFilters.mjs";

const row = (id, missing, expected, complete = false) => ({
  id, missingLearners: missing, expectedLearners: expected, learnerComplete: complete,
});
const rows = [row("Formation Été", 2, 3), row("Autre session", 0, 2, true), row("Sans inscrit", 0, 0), row("Formation Été 2", 4, 5)];
const text = item => item.id;

test("satisfaction : vue à relancer priorise les réponses manquantes", () => {
  assert.deepEqual(filterDailySatisfactionRows(rows, "", "missing", text).map(r => r.id),
    ["Formation Été 2", "Formation Été"]);
});

test("satisfaction : la vue complète exclut les sessions sans apprenant attendu", () => {
  assert.deepEqual(filterDailySatisfactionRows(rows, "", "complete", text).map(r => r.id), ["Autre session"]);
});

test("satisfaction : recherche insensible aux accents et à la casse", () => {
  assert.deepEqual(filterDailySatisfactionRows(rows, " ETE ", "all", text).map(r => r.id),
    ["Formation Été", "Formation Été 2"]);
});

test("satisfaction : paramètres invalides, tableaux et longueur sont bornés", () => {
  assert.equal(normalizeDailySatisfactionView(["missing", "complete"]), "missing");
  assert.equal(normalizeDailySatisfactionView("unknown"), "all");
  assert.equal(normalizeDailySatisfactionQuery([" x ", "y"]), "x");
  assert.equal(normalizeDailySatisfactionQuery("x".repeat(120)).length, 80);
  assert.deepEqual(filterDailySatisfactionRows(rows, "", "unknown", text), rows);
});

test("satisfaction : filtre après périmètre agent, sans écriture métier", async () => {
  const source = await readFile(new URL("../src/app/agent/daily/satisfaction/page.tsx", import.meta.url), "utf8");
  assert.match(source, /requireSupportAgent\(\)/);
  assert.match(source, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(source, /filterDailySatisfactionRows\(rows,/);
  assert.match(source, /visibleRows\.map\(/);
  assert.match(source, /aria-label="Filtrer les sessions de satisfaction"/);
  assert.match(source, /<progress/);
  for (const table of ["daily_sessions", "daily_session_enrolments", "daily_learner_feedback_responses", "daily_stakeholder_satisfaction_responses"]) {
    assert.match(source, new RegExp('\\.from\\("'+table+'"\\)[\\s\\S]*?\\.in\\("organisation_id", organisationIds\\)'));
  }
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});
