import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeDailyPilotageQuery, searchDailyPilotageTasks } from "../src/lib/daily/pilotageTaskSearch.mjs";
import { filterDailyPilotageTasks, countDailyPilotageViews } from "../src/lib/daily/pilotageTaskFilters.mjs";

const tasks = [
  { id: "1", title: "Émargement en attente", reason: "Présence", detail: "Session automne", priority: "urgent", assignedAgentProfileId: "other" },
  { id: "2", title: "Dossier à clôturer", reason: "Évaluation", detail: "Formation qualité", priority: "high", assignedAgentProfileId: "mine" },
  { id: "3", title: "Relance de justificatif", reason: "Document", detail: "Session printemps", priority: "normal", assignedAgentProfileId: "mine" },
];
const searchable = task => [task.title, task.reason, task.detail].join(" ");

test("normalise et borne une recherche URL sans accepter les paramètres multiples", () => {
  assert.equal(normalizeDailyPilotageQuery("  présence   automne "), "présence automne");
  assert.equal(normalizeDailyPilotageQuery(["présence", "autre"]), "");
  assert.equal(normalizeDailyPilotageQuery("x".repeat(200)).length, 80);
  assert.equal(normalizeDailyPilotageQuery(null), "");
});

test("retrouve les tâches par plusieurs mots indépendamment des accents, casse et ordre", () => {
  assert.deepEqual(searchDailyPilotageTasks(tasks, "AUTOMNE emargement", searchable).map(t => t.id), ["1"]);
  assert.deepEqual(searchDailyPilotageTasks(tasks, "qualite evaluation", searchable).map(t => t.id), ["2"]);
  assert.deepEqual(searchDailyPilotageTasks(tasks, "absent", searchable), []);
});

test("la recherche ne modifie ni les tâches ni leurs droits et ne filtre pas par attribution", () => {
  const before = structuredClone(tasks);
  const found = searchDailyPilotageTasks(tasks, "présence", searchable);
  assert.equal(found[0], tasks[0], "une tâche d'un autre agent reste visible en lecture seule");
  assert.deepEqual(tasks, before);
  assert.notEqual(searchDailyPilotageTasks(tasks, "", searchable), tasks);
});

test("les filtres et compteurs portent sur les seuls résultats recherchés sans changer le garde de traitement", () => {
  const found = searchDailyPilotageTasks(tasks, "formation", searchable);
  const options = { canTreat: t => t.assignedAgentProfileId === "mine" };
  assert.deepEqual(countDailyPilotageViews(found, options), { all: 1, urgent: 0, overdue: 0, actionable: 1 });
  assert.deepEqual(filterDailyPilotageTasks(found, "actionable", options).map(t => t.id), ["2"]);
});

test("le pilotage conserve la recherche dans les filtres, les autorisations et le retour à la vue", async () => {
  const page = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
  assert.match(page, /filterDailyPilotageOrganisationTasks\(tasks, selectedOrganisation\)/);
  assert.match(page, /filterDailyPilotageTaskPhase\(organisationTasks, selectedPhase\)/);
  assert.match(page, /searchDailyPilotageTasks\(phaseTasks, searchQuery/);
  assert.match(page, /countDailyPilotageViews\(searchedTasks, access\)/);
  assert.match(page, /filterDailyPilotageTasks\(searchedTasks, selectedView, access\)/);
  assert.match(page, /canTreatDailyPilotageTask\(item, staff\)/);
  assert.match(page, /aria-label="Rechercher une tâche Daily"/);
  assert.match(page, /name="q"/);
  assert.match(page, /filterHref\(view\.key\)/);
});
