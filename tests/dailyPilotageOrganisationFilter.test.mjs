import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dailyPilotageOrganisationOptions, selectDailyPilotageOrganisation, filterDailyPilotageOrganisationTasks } from "../src/lib/daily/pilotageOrganisationFilter.mjs";

const task = (id, organisationId, organisation) => ({
  id, organisationId, organisation, assignedAgentProfileId: "agent-1", status: "open",
});

test("le filtre propose uniquement les organismes des tâches déjà visibles", () => {
  const tasks = [task("a", "of-2", "Zèbre"), task("b", "of-1", "École"), task("c", "of-1", "École")];
  assert.deepEqual(dailyPilotageOrganisationOptions(tasks), [
    { id: "of-1", name: "École", count: 2 },
    { id: "of-2", name: "Zèbre", count: 1 },
  ]);
});

test("le filtre refuse un identifiant inconnu ou un paramètre URL multiple", () => {
  const options = dailyPilotageOrganisationOptions([task("a", "of-1", "École")]);
  for (const value of ["of-2", ["of-1", "of-2"], null, undefined, "", 12]) {
    assert.equal(selectDailyPilotageOrganisation(value, options), "");
  }
  assert.equal(selectDailyPilotageOrganisation("of-1", options), "of-1");
});

test("la sélection conserve uniquement les tâches de l'organisme demandé, sans mutation", () => {
  const tasks = [task("a", "of-1", "École"), task("b", "of-2", "Zèbre"), task("c", "of-1", "École")];
  const filtered = filterDailyPilotageOrganisationTasks(tasks, "of-1");
  assert.deepEqual(filtered.map(item => item.id), ["a", "c"]);
  assert.equal(filtered[0], tasks[0]);
  assert.equal(filtered[0].assignedAgentProfileId, "agent-1");
  assert.deepEqual(tasks.map(item => item.id), ["a", "b", "c"]);
  assert.notEqual(filterDailyPilotageOrganisationTasks(tasks, ""), tasks);
});

test("les organismes sans nom ou identifiant ne polluent pas le sélecteur", () => {
  const options = dailyPilotageOrganisationOptions([
    task("a", "", "Sans identifiant"),
    task("b", "of-1", " "),
    task("c", "of-1", "Autre nom"),
  ]);
  assert.deepEqual(options, [{ id: "of-1", name: "Organisme sans nom", count: 2 }]);
});

test("la page filtre avant recherche, vues et pagination, sans nouvelle requête", async () => {
  const page = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
  assert.match(page, /dailyPilotageOrganisationOptions\(tasks\)/);
  assert.match(page, /selectDailyPilotageOrganisation\(params\?\.organisme, organisations\)/);
  assert.match(page, /filterDailyPilotageOrganisationTasks\(tasks, selectedOrganisation\)/);
  assert.match(page, /searchDailyPilotageTasks\(organisationTasks, searchQuery/);
  assert.match(page, /filterDailyPilotageTasks\(searchedTasks, selectedView, access\)/);
  assert.match(page, /canTreatDailyPilotageTask\(item, staff\)/);
  assert.match(page, /<select id="daily-organisation-filter" name="organisme"/);
});

test("la navigation conserve organisme, vue, recherche et page indépendante des relances", async () => {
  const page = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
  assert.match(page, /query\.set\("organisme", selectedOrganisation\)/);
  assert.match(page, /query\.set\("vue", selectedView\)/);
  assert.match(page, /query\.set\("q", searchQuery\)/);
  assert.match(page, /query\.set\("relances", String\(followupPagination\.page\)\)/);
  assert.match(page, /query\.set\("page", String\(pagination\.page\)\)/);
  assert.match(page, /<input type="hidden" name="organisme" value=\{selectedOrganisation\}/);
  assert.match(page, /<input type="hidden" name="relances" value=\{followupPagination\.page\}/);
});
