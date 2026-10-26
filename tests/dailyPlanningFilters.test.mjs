import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DAILY_PLANNING_STATES, filterDailyPlanningRows, normalizeDailyPlanningQuery, normalizeDailyPlanningState } from "../src/lib/daily/dailyPlanningFilters.mjs";

const rows = [
  { sessionId: "a", organisationName: "École du Sud", formationTitle: "Soudure", reference: "AB-1", state: "À préparer" },
  { sessionId: "b", organisationName: "Centre Nord", formationTitle: "Électricité", reference: "XY-2", state: "En cours" },
  { sessionId: "c", organisationName: "École du Sud", formationTitle: "Électricité", reference: "AB-3", state: "Dates à vérifier" },
];

test("planning : recherche accent-insensible sur organisme, formation et référence", () => {
  assert.deepEqual(filterDailyPlanningRows(rows, " ecole ", "all").map(row => row.sessionId), ["a", "c"]);
  assert.deepEqual(filterDailyPlanningRows(rows, "ELECTRICITE", "all").map(row => row.sessionId), ["b", "c"]);
  assert.deepEqual(filterDailyPlanningRows(rows, "xy-2", "all").map(row => row.sessionId), ["b"]);
});

test("planning : filtre état strict et combinable avec recherche", () => {
  assert.deepEqual(filterDailyPlanningRows(rows, "", "current").map(row => row.sessionId), ["b"]);
  assert.deepEqual(filterDailyPlanningRows(rows, "école", "dates").map(row => row.sessionId), ["c"]);
  assert.deepEqual(filterDailyPlanningRows(rows, "centre", "prepare"), []);
  assert.equal(DAILY_PLANNING_STATES.prepare, "À préparer");
});

test("planning : paramètres inconnus, tableaux et longueur bornés", () => {
  assert.equal(normalizeDailyPlanningState("bogus"), "all");
  assert.equal(normalizeDailyPlanningState(["close", "ready"]), "close");
  assert.equal(normalizeDailyPlanningQuery([" x ", "y"]), "x");
  assert.equal(normalizeDailyPlanningQuery("a".repeat(150)).length, 80);
  assert.deepEqual(filterDailyPlanningRows(rows, "", "bogus"), rows);
});

test("planning : filtres après résolution du périmètre, sans mutation de données", async () => {
  const source = await readFile(new URL("../src/app/agent/daily/planning/page.tsx", import.meta.url), "utf8");
  assert.match(source, /requireSupportAgent\(\)/);
  assert.match(source, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(source, /\.in\("organisation_id", organisationIds\)/);
  assert.match(source, /filterDailyPlanningRows\(activeRows,/);
  assert.match(source, /visibleActiveRows\.map\(/);
  assert.match(source, /aria-label="Filtrer le planning actif"/);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});
