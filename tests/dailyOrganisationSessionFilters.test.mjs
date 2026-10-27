import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { filterDailyOrganisationSessionGroups } from "../src/lib/daily/dailyOrganisationSessionFilters.mjs";

const session = (id, title, extra = {}) => ({
  id, internal_reference: id, start_date: "2026-11-02", end_date: "2026-11-03",
  daily_formations: { title }, ...extra,
});
const groups = [
  { id: "planned", title: "À venir", sessions: [session("A-1", "Écriture créative"), session("B-2", "Sécurité")] },
  { id: "current", title: "En cours", sessions: [session("C-3", "Pédagogie")] },
  { id: "closing", title: "À clôturer", sessions: [] },
  { id: "history", title: "Terminées", sessions: [session("D-4", "Bilan")] },
];

test("sessions OF : recherche insensible aux accents et à la casse", () => {
  const result = filterDailyOrganisationSessionGroups(groups, { query: "ECRITURE" });
  assert.deepEqual(result.flatMap(group => group.sessions.map(row => row.id)), ["A-1"]);
});

test("sessions OF : recherche sur référence et dates, sans autres données", () => {
  assert.deepEqual(filterDailyOrganisationSessionGroups(groups, { query: "B-2" }).flatMap(group => group.sessions.map(row => row.id)), ["B-2"]);
  assert.equal(filterDailyOrganisationSessionGroups(groups, { query: "2026-11-02" }).reduce((n, group) => n + group.sessions.length, 0), 4);
  assert.equal(filterDailyOrganisationSessionGroups(groups, { query: "inexistant" }).reduce((n, group) => n + group.sessions.length, 0), 0);
});

test("sessions OF : filtre de phase sans perdre les sessions des autres groupes", () => {
  const result = filterDailyOrganisationSessionGroups(groups, { phase: "current" });
  assert.deepEqual(result.map(group => group.id), ["current"]);
  assert.deepEqual(result[0].sessions.map(row => row.id), ["C-3"]);
  assert.equal(groups[0].sessions.length, 2);
});

test("sessions OF : phase inconnue neutralisée et groupe vide conservé", () => {
  assert.equal(filterDailyOrganisationSessionGroups(groups, { phase: "not-a-phase" }).length, 4);
  assert.deepEqual(filterDailyOrganisationSessionGroups(groups, { phase: "closing" })[0].sessions, []);
});

test("sessions OF : pas de mutation, pas de duplication, recherche bornée", () => {
  const frozen = Object.freeze([{ id: "planned", sessions: Object.freeze([Object.freeze(session("X", "Atelier"))]) }]);
  const result = filterDailyOrganisationSessionGroups(frozen, { query: "Atelier" });
  assert.notStrictEqual(result[0], frozen[0]);
  assert.notStrictEqual(result[0].sessions, frozen[0].sessions);
  assert.deepEqual(result[0].sessions.map(row => row.id), ["X"]);
  assert.equal(filterDailyOrganisationSessionGroups(groups, { query: "x".repeat(80) + "B-2" }).flatMap(group => group.sessions).length, 0);
});

test("sessions OF : les contrôles serveur et les liens canoniques sont conservés", async () => {
  const page = await readFile(new URL("../src/app/agent/daily/organisations/[id]/page.tsx", import.meta.url), "utf8");
  const component = await readFile(new URL("../src/components/daily/DailyOrganisationSessions.tsx", import.meta.url), "utf8");
  assert.match(page, /isDailyOrganisationInAgentScope\(auth\.email, id\)/);
  assert.match(component, /filterDailyOrganisationSessionGroups\(groups,/);
  assert.match(component, /\/agent\/daily\/session-dossiers\/\$\{encodeURIComponent\(session\.id\)\}\/full/);
  for (const fragment of ["vue-ensemble", "documents-avant-formation", "pendant-formation", "apres-formation"]) {
    assert.match(component, new RegExp(fragment));
  }
  assert.doesNotMatch(component, /fetch\(|\.insert\(|\.update\(|\.delete\(/);
});
