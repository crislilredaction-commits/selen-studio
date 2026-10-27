import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildDailyOrganisationPriorityRows, sortDailyOrganisationPriorityRows } from "../src/lib/daily/dailyOrganisationPriority.mjs";

const orgs = Object.freeze([
  Object.freeze({ id: "ok", name: "Zénith", legal_name: null }),
  Object.freeze({ id: "task", name: "École", legal_name: null }),
  Object.freeze({ id: "validation", name: "Alpha", legal_name: null }),
  Object.freeze({ id: "cert", name: "Beta", legal_name: null }),
  Object.freeze({ id: "unassigned", name: "Delta", legal_name: null }),
  Object.freeze({ id: "programmes", name: "Gamma", legal_name: null }),
]);
const counts = (entries = []) => new Map(entries);
const options = {
  taskCounts: counts([["task", 3]]),
  validationCounts: counts([["validation", 1]]),
  certificationCounts: counts([["cert", 2]]),
  programmeCounts: counts([["programmes", 4]]),
  assignedIds: new Set(["ok", "task", "validation", "cert", "programmes"]),
};

test("organismes : ordre métier des urgences sans faux signal", () => {
  const rows = sortDailyOrganisationPriorityRows(buildDailyOrganisationPriorityRows(orgs, options), "priority");
  assert.deepEqual(rows.map(row => row.id), ["validation", "cert", "task", "unassigned", "programmes", "ok"]);
  assert.deepEqual(rows.map(row => row.priorityRank), [0, 1, 2, 3, 4, 5]);
  assert.equal(rows.at(-1).priorityLabel, "Aucune alerte");
});

test("organismes : tri des programmes à finaliser et tri alphabétique accent-insensible", () => {
  const rows = buildDailyOrganisationPriorityRows(orgs, options);
  assert.equal(sortDailyOrganisationPriorityRows(rows, "programmes")[0].id, "programmes");
  assert.deepEqual(sortDailyOrganisationPriorityRows(rows, "name").map(row => row.id), ["validation", "cert", "unassigned", "task", "programmes", "ok"]);
});

test("organismes : égalités stables, sans mutation ni duplication", () => {
  const input = Object.freeze([Object.freeze({ id: "b", name: "École" }), Object.freeze({ id: "a", name: "Ecole" })]);
  const rows = buildDailyOrganisationPriorityRows(input, { ...options, assignedIds: new Set(["a", "b"]) });
  assert.deepEqual(sortDailyOrganisationPriorityRows(rows, "priority").map(row => row.id), ["a", "b"]);
  assert.equal(input[0].priorityRank, undefined);
  assert.notStrictEqual(rows[0], input[0]);
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
});

test("organismes : priorité uniquement sur la liste fournie, pas d'accès hors périmètre", () => {
  const result = buildDailyOrganisationPriorityRows([orgs[0]], options);
  assert.deepEqual(result.map(row => row.id), ["ok"]);
  assert.equal(result[0].priorityCount, 0);
});

test("organismes : contrat de sécurité et de lecture seule conservé", async () => {
  const page = await readFile(new URL("../src/app/agent/daily/organisations/page.tsx", import.meta.url), "utf8");
  assert.match(page, /requireSupportAgent\(\)/);
  assert.match(page, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(page, /\.in\("id", scopeIds\)/);
  assert.match(page, /buildDailyOrganisationPriorityRows\(visibleOrganisations,/);
  assert.match(page, /sortDailyOrganisationPriorityRows\(priorityRows/);
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});
