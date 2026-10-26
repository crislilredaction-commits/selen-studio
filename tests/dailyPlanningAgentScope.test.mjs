import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { countOpenDailySessionChecklistItems } from "../src/lib/daily/planningSessionOverview.mjs";

const page = () => readFile(new URL("../src/app/agent/daily/planning/page.tsx", import.meta.url), "utf8");

test("planning : périmètre agent actif résolu après authentification, avant les lectures", async () => {
  const source = await page();
  const auth = source.indexOf("const auth = await requireSupportAgent()");
  const scope = source.indexOf("getDailyOrganisationIdsForAgent(auth.email)");
  const dossiers = source.indexOf('.from("daily_session_dossiers")');
  assert.ok(auth >= 0 && auth < scope && scope < dossiers);
  assert.doesNotMatch(source, /getActiveDailyOrganisationIds/);
  assert.match(source, /\.in\("organisation_id", organisationIds\)/);
  assert.match(source, /if \(dossiersError\)/);
});

test("planning : les lectures annexes dépendent uniquement des dossiers autorisés", async () => {
  const source = await page();
  assert.match(source, /const sessionIds = \[\.\.\.new Set\(\(dossiers \?\? \[\]\)\.map\(\(d\) => d\.session_id\)\)\]/);
  assert.match(source, /const orgIds = \[\.\.\.new Set\(\(dossiers \?\? \[\]\)\.map\(\(d\) => d\.organisation_id\)\)\]/);
  assert.match(source, /\.in\("id", sessionIds\)/);
  assert.match(source, /\.in\("id", orgIds\)/);
  assert.match(source, /\.in\("session_id", sessionIds\)/);
  assert.match(source, /if \(sessionsError \|\| organisationsError \|\| itemsError\)/);
  assert.match(source, /if \(formationsError\)/);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test("planning : aucun organisme autorisé donne une liste vide, pas une lecture globale", async () => {
  const source = await page();
  assert.match(source, /const \{ data: dossiers, error: dossiersError \} = organisationIds\.length/);
  assert.match(source, /: \{ data: \[\], error: null \};/);
  assert.match(source, /Impossible de vérifier votre périmètre Daily/);
  assert.match(source, /Aucune session Daily active accessible dans votre périmètre/);
});

test("planning : comptage des pièces ouvertes par session, sans mélanger les organismes", () => {
  const counts = countOpenDailySessionChecklistItems([
    { session_id: "session-A", status: "to_check" },
    { session_id: "session-A", status: "validated" },
    { session_id: "session-A", status: "not_applicable" },
    { session_id: "session-B", status: "pending" },
    { session_id: "session-B", status: "blocked" },
    { session_id: "session-C", status: "validated" },
  ]);
  assert.deepEqual([...counts], [["session-A", 1], ["session-B", 2]]);
  assert.equal(counts.get("session-C") ?? 0, 0);
});

test("planning : agrégation sans mutation, données vides ou malformées ignorées", () => {
  const rows = Object.freeze([
    Object.freeze({ session_id: "S1", status: "pending" }),
    Object.freeze({ session_id: "", status: "pending" }),
    Object.freeze({ session_id: "S1", status: "pending" }),
  ]);
  assert.equal(countOpenDailySessionChecklistItems(rows).get("S1"), 2);
  assert.equal(countOpenDailySessionChecklistItems([]).size, 0);
});
