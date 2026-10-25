import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { prioritizeDailyPilotageTasks, paginateDailyPilotageTasks } from "../src/lib/daily/pilotageTaskQueue.mjs";

const task = (id, priority, dueAt = null) => ({ id, priority, dueAt, assignedAgentProfileId: "agent-1", status: "open" });

test("les urgences précèdent les priorités hautes et normales", () => {
  const items = [task("normal", "normal"), task("high", "high"), task("urgent", "urgent")];
  assert.deepEqual(prioritizeDailyPilotageTasks(items).map(item => item.id), ["urgent", "high", "normal"]);
  assert.deepEqual(items.map(item => item.id), ["normal", "high", "urgent"], "la source n'est pas mutée");
});

test("les échéances les plus proches sont prioritaires au sein d'un niveau", () => {
  const items = [
    task("sans-date", "high"),
    task("plus-tard", "high", "2026-11-05T12:00:00Z"),
    task("en-retard", "high", "2026-10-20T12:00:00Z"),
    task("date-invalide", "high", "date-invalide"),
  ];
  assert.deepEqual(prioritizeDailyPilotageTasks(items).map(item => item.id), ["en-retard", "plus-tard", "sans-date", "date-invalide"]);
});

test("un tri stable préserve les droits, les objets et les égalités", () => {
  const a = task("a", "urgent");
  const b = task("b", "urgent");
  const result = prioritizeDailyPilotageTasks([a, b]);
  assert.equal(result[0], a);
  assert.equal(result[1], b);
  assert.equal(a.assignedAgentProfileId, "agent-1");
  assert.equal(a.status, "open");
});

test("le pilotage utilise le tri et conserve les contrôles d'autorisation", async () => {
  const page = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
  assert.match(page, /prioritizeDailyPilotageTasks\(filterDailyPilotageTasks\(searchedTasks, selectedView/);
  assert.match(page, /sortedTasks\.map\(\(item\)/);
  assert.match(page, /canTreatDailyPilotageTask\(item, staff\)/);
  assert.match(page, /Traitement réservé à l’agent assigné/);
  assert.match(page, /<span>urgences<\/span>/);
});

test("la pagination garde les priorités, les références et les attributions", () => {
  const tasks = Array.from({ length: 45 }, (_, i) => task(String(i), "high"));
  const ordered = prioritizeDailyPilotageTasks(tasks);
  const page = paginateDailyPilotageTasks(ordered, "2");
  assert.equal(page.total, 45);
  assert.equal(page.totalPages, 3);
  assert.equal(page.page, 2);
  assert.equal(page.from, 21);
  assert.equal(page.to, 40);
  assert.deepEqual(page.items.map(item => item.id), Array.from({ length: 20 }, (_, i) => String(i + 20)));
  assert.equal(page.items[0], tasks[20]);
  assert.equal(tasks[20].assignedAgentProfileId, "agent-1");
});

test("une page hors bornes est ramenée à la dernière page sans perte de tâches", () => {
  const tasks = Array.from({ length: 22 }, (_, i) => task(String(i), "normal"));
  const page = paginateDailyPilotageTasks(tasks, "999999");
  assert.equal(page.page, 2);
  assert.deepEqual(page.items.map(item => item.id), ["20", "21"]);
  assert.equal(page.to, 22);
});

test("les paramètres URL invalides ou multiples ne choisissent jamais une autre page", () => {
  const tasks = Array.from({ length: 23 }, (_, i) => task(String(i), "normal"));
  for (const value of [["1", "2"], "0", "-1", "1e3", "__proto__", "abc", null, undefined]) {
    assert.equal(paginateDailyPilotageTasks(tasks, value).page, 1);
  }
  assert.equal(paginateDailyPilotageTasks(tasks, "2").page, 2);
});

test("la file vide et les petites files gardent des bornes compréhensibles", () => {
  assert.deepEqual(paginateDailyPilotageTasks([], "4"), { items: [], page: 1, totalPages: 1, total: 0, from: 0, to: 0 });
  const items = [task("a", "urgent")];
  assert.deepEqual(paginateDailyPilotageTasks(items, "1").items, items);
});

test("la navigation paginée conserve les filtres et recherche, sans contourner les droits", async () => {
  const page = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
  assert.match(page, /paginateDailyPilotageTasks\(allSortedTasks, params\?\.page\)/);
  assert.match(page, /filterDailyPilotageTasks\(searchedTasks, selectedView, access\)/);
  assert.match(page, /canTreatDailyPilotageTask\(item, staff\)/);
  assert.match(page, /query\.set\("vue", selectedView\)/);
  assert.match(page, /query\.set\("q", searchQuery\)/);
  assert.match(page, /aria-label="Pages des tâches Daily"/);
  assert.match(page, /sortedTasks\.map\(\(item\)/);
});
