import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildDailyPlanningPriorityRows } from "../src/lib/daily/dailyPlanningTriage.mjs";

const row = (id, state, overrides = {}) => ({
  sessionId: id,
  dossierStatus: "active",
  organisationName: "École du Sud",
  formationTitle: "Formation A",
  reference: id,
  start: "2026-10-29",
  end: "2026-10-30",
  openChecklist: 0,
  state,
  ...overrides,
});

test("planning triage : clôture, dates manquantes, contrôles et préparation dans l'ordre métier", () => {
  const rows = [
    row("later", "À préparer", { start: "2026-11-15", openChecklist: 2 }),
    row("current", "En cours", { openChecklist: 1 }),
    row("missing", "Dates à vérifier", { start: null }),
    row("close", "À clôturer"),
    row("soon", "À préparer", { start: "2026-11-02", openChecklist: 2 }),
    row("ready", "Prête"),
  ];
  const result = buildDailyPlanningPriorityRows(rows, "2026-10-27");
  assert.deepEqual(result.map(item => item.sessionId), ["close", "missing", "current", "soon", "later"]);
  assert.equal(result[0].priorityLabel, "Clôture en retard");
  assert.match(result[3].actionLabel, /préparation/);
});

test("planning triage : pas de faux signal en session sans contrôle ouvert", () => {
  assert.deepEqual(buildDailyPlanningPriorityRows([row("current", "En cours")], "2026-10-27"), []);
});

test("planning triage : exclut dossiers terminés et entrées absentes", () => {
  const result = buildDailyPlanningPriorityRows([
    null,
    row("archived", "À clôturer", { dossierStatus: "archived" }),
    row("completed", "À clôturer", { dossierStatus: "completed" }),
    row("active", "À clôturer"),
  ], "2026-10-27");
  assert.deepEqual(result.map(item => item.sessionId), ["active"]);
});

test("planning triage : ne modifie pas les données et conserve un tri stable", () => {
  const source = Object.freeze(row("stable", "À préparer", { start: "2026-11-02", openChecklist: 2 }));
  const input = Object.freeze([source]);
  const result = buildDailyPlanningPriorityRows(input, "2026-10-27");
  assert.equal(result[0].sessionId, source.sessionId);
  assert.equal(source.rank, undefined);
  assert.notStrictEqual(result[0], source);
});

test("planning triage : borne le périmètre à la sélection déjà autorisée", async () => {
  const source = await readFile(new URL("../src/app/agent/daily/planning/page.tsx", import.meta.url), "utf8");
  assert.match(source, /requireSupportAgent\(\)/);
  assert.match(source, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(source, /\.in\("organisation_id", organisationIds\)/);
  assert.match(source, /buildDailyPlanningPriorityRows\(visibleActiveRows,/);
  assert.match(source, /priorityRows\.slice\(0, 10\)/);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});
