import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildScopedSessionFollowupRows } from "../src/lib/daily/sessionFollowupScope.mjs";
import { countSessionFollowupStates } from "../src/lib/daily/sessionFollowupFilters.mjs";

const page = () => readFile(new URL("../src/app/agent/daily/suivi-sessions/page.tsx", import.meta.url), "utf8");

test("suivi sessions : authentification et périmètre agent avant toute lecture service-role", async () => {
  const source = await page();
  const auth = source.indexOf("const auth = await requireSupportAgent()");
  const scope = source.indexOf("getDailyOrganisationIdsForAgent(auth.email)");
  const firstQuery = source.indexOf('.from("daily_session_followup_entries")');
  assert.ok(auth >= 0 && auth < scope && scope < firstQuery);
  assert.match(source, /Impossible de vérifier votre périmètre Daily/);
  assert.match(source, /if \(organisationIds.length === 0\)/);
  assert.doesNotMatch(source, /getActiveDailyOrganisationIds/);
});

test("suivi sessions : les lectures métier sont bornées à l’organisme sélectionné", async () => {
  const source = await page();
  for (const table of ["daily_session_followup_entries", "daily_sessions", "daily_formations"]) {
    const section = source.split('.from("' + table + '")')[1]?.split("\n    admin")[0] ?? "";
    assert.match(section, /\.in\("organisation_id", scopedOrganisationIds\)/, table);
  }
  const orgSection = source.split('.from("organisations")')[1]?.split("\n    admin")[0] ?? "";
  assert.match(orgSection, /\.in\("id", organisationIds\)/);
  assert.match(source, /if \(entriesError \|\| sessionsError \|\| formationsError\)/);
  assert.ok(source.indexOf("resolveSessionFollowupOrganisationSelection(params.organisation_id") < source.indexOf('.from("daily_session_followup_entries")'));
  assert.match(source, /selection\.id \? \[selection\.id\] : activeOrganisationIds/);
  assert.match(source, /if \(selection\.id && !activeOrganisationIds\.includes\(selection\.id\)\)/);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test("suivi sessions : aucune entrée étrangère ou sans organisme autorisé", () => {
  const entries = [
    { id: "a", organisation_id: "A", session_id: "SA", status: "open" },
    { id: "b", organisation_id: "B", session_id: "SB", status: "open" },
    { id: "c", organisation_id: "A", session_id: "SB", status: "open" },
  ];
  const rows = buildScopedSessionFollowupRows(entries,
    [{ id: "SA", organisation_id: "A", formation_id: "FA", status: "active" }, { id: "SB", organisation_id: "B", status: "active" }],
    [{ id: "FA", organisation_id: "A", title: "A" }],
    [{ id: "A", name: "OF A" }, { id: "B", name: "OF B" }],
    ["A"]);
  assert.deepEqual(rows.map((row) => row.entry.id), ["a"]);
  assert.equal(rows[0].organisation.name, "OF A");
  assert.equal(rows[0].formation.title, "A");
});

test("suivi sessions : ne joint pas une formation appartenant à un autre organisme", () => {
  const rows = buildScopedSessionFollowupRows(
    [{ id: "a", organisation_id: "A", session_id: "SA" }],
    [{ id: "SA", organisation_id: "A", formation_id: "FB", status: "active" }],
    [{ id: "FB", organisation_id: "B", title: "Donnée étrangère" }],
    [{ id: "A", name: "OF A" }],
    ["A", "B"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].formation, undefined);
});

test("suivi sessions : historique conservé en lecture seule, données sources inchangées", () => {
  const entries = Object.freeze([{ id: "a", organisation_id: "A", session_id: "SA" }]);
  const sessions = Object.freeze([{ id: "SA", organisation_id: "A", status: "archived" }]);
  const organisations = Object.freeze([{ id: "A", name: "OF A" }]);
  const rows = buildScopedSessionFollowupRows(entries, sessions, [], organisations, ["A"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actionable, false);
  assert.deepEqual(buildScopedSessionFollowupRows(entries, sessions, [], organisations, []), []);
  assert.deepEqual(entries, [{ id: "a", organisation_id: "A", session_id: "SA" }]);
});

test("suivi sessions : compteurs isolés entre deux organismes homonymes", () => {
  const entries = [
    { id: "a", organisation_id: "A", session_id: "SA", status: "open", level: "critical" },
    { id: "b", organisation_id: "B", session_id: "SB", status: "resolved", level: "info" },
  ];
  const sessions = [
    { id: "SA", organisation_id: "A", status: "active" },
    { id: "SB", organisation_id: "B", status: "active" },
  ];
  const organisations = [{ id: "A", name: "Même nom" }, { id: "B", name: "Même nom" }];
  const rows = buildScopedSessionFollowupRows(entries, sessions, [], organisations, ["B"]);
  assert.deepEqual(rows.map((row) => row.entry.id), ["b"]);
  assert.deepEqual(countSessionFollowupStates(rows), { all: 1, open: 0, resolved: 1, history: 0 });
});
