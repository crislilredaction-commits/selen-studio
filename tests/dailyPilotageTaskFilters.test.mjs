import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeDailyPilotageView, isOverdueDailyPilotageTask, filterDailyPilotageTasks, countDailyPilotageViews } from "../src/lib/daily/pilotageTaskFilters.mjs";

const now = new Date("2026-10-25T12:00:00Z");
const task = (id, priority, dueAt, assignedAgentProfileId) => ({ id, priority, dueAt, assignedAgentProfileId, status: "open" });
const tasks = [
  task("urgent-other", "urgent", "2026-10-24T10:00:00Z", "other"),
  task("high-mine", "high", "2026-10-26T10:00:00Z", "mine"),
  task("normal-unknown", "normal", "invalid-date", null),
  task("normal-undated", "normal", null, "mine"),
];

test("les vues inconnues et paramètres multiples reviennent à toutes les tâches", () => {
  assert.equal(normalizeDailyPilotageView("overdue"), "overdue");
  assert.equal(normalizeDailyPilotageView(["urgent", "all"]), "all");
  assert.equal(normalizeDailyPilotageView("__proto__"), "all");
  assert.equal(normalizeDailyPilotageView(undefined), "all");
});

test("le filtre échéance ignore dates absentes ou invalides, sans masquer une vraie urgence", () => {
  assert.equal(isOverdueDailyPilotageTask(tasks[0], now), true);
  assert.equal(isOverdueDailyPilotageTask(tasks[1], now), false);
  assert.equal(isOverdueDailyPilotageTask(tasks[2], now), false);
  assert.equal(isOverdueDailyPilotageTask(tasks[3], now), false);
  assert.deepEqual(filterDailyPilotageTasks(tasks, "overdue", { now }).map(t => t.id), ["urgent-other"]);
  assert.deepEqual(filterDailyPilotageTasks(tasks, "urgent", { now }).map(t => t.id), ["urgent-other"]);
});

test("les tâches traitables utilisent exclusivement le garde d'autorisation transmis", () => {
  const canTreat = t => t.assignedAgentProfileId === "mine";
  assert.deepEqual(filterDailyPilotageTasks(tasks, "actionable", { now, canTreat }).map(t => t.id), ["high-mine", "normal-undated"]);
  assert.deepEqual(filterDailyPilotageTasks(tasks, "actionable", { now }).map(t => t.id), []);
  assert.deepEqual(countDailyPilotageViews(tasks, { now, canTreat }), { all: 4, urgent: 1, overdue: 1, actionable: 2 });
});

test("les vues ne mutent pas les objets, leur ordre ou les assignations", () => {
  const copy = tasks.slice();
  const result = filterDailyPilotageTasks(tasks, "all", { now });
  assert.deepEqual(result, tasks);
  assert.notEqual(result, tasks);
  assert.equal(result[0], tasks[0]);
  assert.deepEqual(tasks, copy);
  assert.equal(tasks[0].assignedAgentProfileId, "other");
});

test("l'interface conserve le contrôle d'accès serveur et expose les vues en liens", async () => {
  const page = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
  assert.match(page, /requireSupportAgent\(\)/);
  assert.match(page, /canTreatDailyPilotageTask\(item, staff\)/);
  assert.match(page, /filterDailyPilotageTasks\(searchedTasks, selectedView/);
  assert.match(page, /aria-label="Filtrer les tâches Daily"/);
  assert.match(page, /aria-current=\{selectedView === view\.key \? "page" : undefined\}/);
  assert.match(page, /sortedTasks\.map\(\(item\)/);
});
