import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { prioritizeDailyPilotageTasks } from "../src/lib/daily/pilotageTaskQueue.mjs";

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
