import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildScopedSessionFollowupRows } from "../src/lib/daily/sessionFollowupScope.mjs";

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

test("suivi sessions : les quatre lectures sont limitées aux organismes autorisés", async () => {
  const source = await page();
  for (const table of ["daily_session_followup_entries", "daily_sessions", "daily_formations"]) {
    const section = source.split('.from("' + table + '")')[1]?.split("\n    admin")[0] ?? "";
    assert.match(section, /\.in\("organisation_id", organisationIds\)/, table);
  }
  const orgSection = source.split('.from("organisations")')[1]?.split("\n    admin")[0] ?? "";
  assert.match(orgSection, /\.in\("id", organisationIds\)/);
  assert.match(source, /if \(entriesError \|\| sessionsError \|\| formationsError \|\| organisationsError\)/);
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
