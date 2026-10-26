import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CANDIDATURE_VIEWS,
  candidatureQueueCategory,
  countCandidatureQueueViews,
  filterCandidatureQueue,
  normalizeCandidatureSearch,
  normalizeCandidatureView,
  prioritizeCandidatureQueue,
} from "../src/lib/daily/dailyCandidatureQueue.mjs";

const rows = [
  { id: "a", decision_status: "pending", respondent_first_name: "Élodie", respondent_last_name: "Martin", submitted_at: "2026-10-20", daily_formations: { title: "Soudure" } },
  { id: "b", decision_status: "pending", company_name: "École du Nord", submitted_at: "2026-10-22", daily_formations: [{ title: "Électricité" }] },
  { id: "c", decision_status: "ready_for_of", respondent_email: "client@example.test", submitted_at: "2026-10-21", daily_formations: { title: "Cuisine" } },
  { id: "d", decision_status: "pending", respondent_first_name: "Luc", submitted_at: "2026-10-19", daily_formations: { title: "Soudure" } },
];
const evidence = new Map([
  ["a", { submitted: 1, rejected: 0, verified: 0 }],
  ["b", { submitted: 0, rejected: 2, verified: 0 }],
  ["d", { submitted: 0, rejected: 0, verified: 1 }],
]);

test("candidatures : priorités exclusives et synthèse exacte", () => {
  assert.equal(candidatureQueueCategory(rows[0], evidence), "evidence");
  assert.equal(candidatureQueueCategory(rows[1], evidence), "rejected");
  assert.equal(candidatureQueueCategory(rows[2], evidence), "decision");
  assert.equal(candidatureQueueCategory(rows[3], evidence), "analysis");
  assert.deepEqual(countCandidatureQueueViews(rows, evidence), { all: 4, evidence: 1, rejected: 1, analysis: 1, decision: 1 });
  assert.equal(CANDIDATURE_VIEWS.decision, "Décision OF attendue");
});

test("candidatures : tri priorise les pièces reçues sans muter les lignes", () => {
  const initial = rows.map(row => row.id);
  assert.deepEqual(prioritizeCandidatureQueue(rows, evidence).map(row => row.id), ["a", "b", "d", "c"]);
  assert.deepEqual(rows.map(row => row.id), initial);
});

test("candidatures : recherche accent-insensible et combinaison avec étape", () => {
  assert.deepEqual(filterCandidatureQueue(rows, "elodie", "all", evidence).map(row => row.id), ["a"]);
  assert.deepEqual(filterCandidatureQueue(rows, "ELECTRICITE", "rejected", evidence).map(row => row.id), ["b"]);
  assert.deepEqual(filterCandidatureQueue(rows, "client@example.test", "decision", evidence).map(row => row.id), ["c"]);
  assert.deepEqual(filterCandidatureQueue(rows, "soudure", "analysis", evidence).map(row => row.id), ["d"]);
  assert.deepEqual(filterCandidatureQueue(rows, "soudure", "decision", evidence), []);
});

test("candidatures : paramètres inconnus ou multiples sont bornés", () => {
  assert.equal(normalizeCandidatureView("nonsense"), "all");
  assert.equal(normalizeCandidatureView(["evidence", "decision"]), "evidence");
  assert.equal(normalizeCandidatureSearch([" A ", "B"]), "A");
  assert.equal(normalizeCandidatureSearch("a".repeat(200)).length, 80);
  assert.deepEqual(filterCandidatureQueue(rows, "", "unknown", evidence), rows);
});

test("candidatures : les filtres interviennent après le contrôle d'affectation et sans écriture", async () => {
  const source = await readFile(new URL("../src/app/agent/daily/candidatures/page.tsx", import.meta.url), "utf8");
  assert.match(source, /requireSupportAgent\(\)/);
  assert.match(source, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(source, /requestedOrganisation && organisationIds\.includes\(requestedOrganisation\)/);
  assert.match(source, /\.in\("formation_id", formationIds\)/);
  assert.match(source, /filterCandidatureQueue\(prioritizedRows,/);
  assert.match(source, /visibleRows\.map\(/);
  assert.match(source, /aria-label="Filtrer les candidatures"/);
  assert.match(source, /Impossible de vérifier votre périmètre Daily/);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});
