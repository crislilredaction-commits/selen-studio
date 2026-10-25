import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeDailyPilotagePhase, getDailyPilotageTaskPhase, filterDailyPilotageTaskPhase, countDailyPilotageTaskPhases } from "../src/lib/daily/pilotageTaskPhases.mjs";

const task = (id, kind, workflowPhase) => ({ id, kind, workflowPhase, assignedAgentProfileId: "agent-1", priority: "high" });

test("le paramètre étape est strict et refuse les valeurs multiples", () => {
  assert.equal(normalizeDailyPilotagePhase("during"), "during");
  for (const value of [undefined, ["before", "after"], "unknown", "__proto__", 1]) {
    assert.equal(normalizeDailyPilotagePhase(value), "all");
  }
});

test("les étapes de checklist sont explicites, sans déduction risquée depuis les liens", () => {
  assert.equal(getDailyPilotageTaskPhase(task("a", "session", "before")), "before");
  assert.equal(getDailyPilotageTaskPhase(task("b", "session", "during")), "during");
  assert.equal(getDailyPilotageTaskPhase(task("c", "session", "after")), "after");
  assert.equal(getDailyPilotageTaskPhase(task("d", "session", "unknown")), "global");
  assert.equal(getDailyPilotageTaskPhase(task("e", "session")), "global");
});

test("les tâches non checklist sont rangées selon leur fonction réelle", () => {
  for (const kind of ["program", "registration", "adaptation"]) assert.equal(getDailyPilotageTaskPhase(task(kind, kind)), "before");
  assert.equal(getDailyPilotageTaskPhase(task("satisfaction", "satisfaction")), "after");
  for (const kind of ["assignment", "organisation", "preaudit", "unknown"]) assert.equal(getDailyPilotageTaskPhase(task(kind, kind)), "global");
});

test("les compteurs et filtres sont cohérents et ne modifient aucune tâche", () => {
  const tasks = [task("a", "program"), task("b", "session", "during"), task("c", "session", "after"), task("d", "assignment"), task("e", "satisfaction")];
  const before = structuredClone(tasks);
  assert.deepEqual(countDailyPilotageTaskPhases(tasks), { all: 5, before: 1, during: 1, after: 2, global: 1 });
  assert.deepEqual(filterDailyPilotageTaskPhase(tasks, "after").map(item => item.id), ["c", "e"]);
  assert.deepEqual(filterDailyPilotageTaskPhase(tasks, ["before", "after"]).map(item => item.id), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(tasks, before);
  assert.equal(filterDailyPilotageTaskPhase(tasks, "during")[0], tasks[1]);
  assert.notEqual(filterDailyPilotageTaskPhase(tasks, "all"), tasks);
});

test("la checklist transmet sa phase canonique au pilotage", async () => {
  const server = await readFile(new URL("../src/lib/server/dailyAgentTasks.ts", import.meta.url), "utf8");
  assert.match(server, /workflowPhase: item\.phase === "before" \|\| item\.phase === "during" \|\| item\.phase === "after"/);
});

test("la page applique étape avant recherche, vues, pagination et garde les droits", async () => {
  const page = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
  assert.match(page, /filterDailyPilotageOrganisationTasks\(tasks, selectedOrganisation\)/);
  assert.match(page, /filterDailyPilotageTaskPhase\(organisationTasks, selectedPhase\)/);
  assert.match(page, /searchDailyPilotageTasks\(phaseTasks, searchQuery/);
  assert.match(page, /filterDailyPilotageTasks\(searchedTasks, selectedView, access\)/);
  assert.match(page, /canTreatDailyPilotageTask\(item, staff\)/);
  assert.match(page, /aria-label="Filtrer les tâches par étape de formation"/);
  assert.match(page, /aria-current=\{selectedPhase === phase\.key \? "page" : undefined\}/);
  assert.match(page, /query\.set\("etape", selectedPhase\)/);
  assert.match(page, /query\.set\("etape", phase\)/);
  assert.match(page, /name="etape" value=\{selectedPhase\}/);
});
