import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  resolveIndicatorOrganisationSelection,
  normalizeIndicatorQuery,
  normalizeIndicatorView,
  filterIndicatorRowsByOrganisation,
  getIndicatorAttentionCount,
  filterIndicatorOrganisations,
} from "../src/lib/daily/indicatorTriage.mjs";

test("indicateurs : sélection OF hors périmètre refusée sans repli implicite", () => {
  assert.deepEqual(resolveIndicatorOrganisationSelection("autre-of", ["of-1"]), { id: null, valid: false });
  assert.deepEqual(resolveIndicatorOrganisationSelection(["autre-of", "of-1"], ["of-1"]), { id: null, valid: false });
  assert.deepEqual(resolveIndicatorOrganisationSelection("of-1", ["of-1"]), { id: "of-1", valid: true });
  assert.deepEqual(resolveIndicatorOrganisationSelection(undefined, ["of-1"]), { id: null, valid: true });
  assert.deepEqual(resolveIndicatorOrganisationSelection("of-1", []), { id: null, valid: false });
});

test("indicateurs : données filtrées sur l'OF choisi, sans élargir le périmètre", () => {
  const rows = [{ organisation_id: "of-1", id: 1 }, { organisation_id: "of-2", id: 2 }];
  assert.deepEqual(filterIndicatorRowsByOrganisation(rows, "of-1"), [rows[0]]);
  assert.deepEqual(filterIndicatorRowsByOrganisation(rows, null), rows);
});

test("indicateurs : paramètres bornés et vue inconnue neutralisée", () => {
  assert.equal(normalizeIndicatorQuery(["  Été   2026  ", "autre"]), "Été 2026");
  assert.equal(normalizeIndicatorQuery("a".repeat(200)).length, 80);
  assert.equal(normalizeIndicatorView(["attention", "all"]), "attention");
  assert.equal(normalizeIndicatorView("invalid"), "all");
});

test("indicateurs : recherche accent-insensible, tri de vigilance et vue à examiner", () => {
  const orgs = [
    { id: "a", name: "École d'été", legal_name: "" },
    { id: "b", name: "Alpha", legal_name: "Alpha formation" },
    { id: "c", name: "Été formation", legal_name: "" },
  ];
  const attention = new Map([["a", { count: 2 }], ["b", { count: 0 }], ["c", { count: 4 }]]);
  assert.deepEqual(filterIndicatorOrganisations(orgs, "ETE", "attention", attention).map((org) => org.id), ["c", "a"]);
  assert.deepEqual(filterIndicatorOrganisations(orgs, "", "all", attention).map((org) => org.id), ["c", "a", "b"]);
  assert.deepEqual(orgs.map((org) => org.id), ["a", "b", "c"], "ne modifie pas les données sources");
});

test("indicateurs : signaux de vigilance explicites sans déduire une satisfaction fictive", () => {
  const count = getIndicatorAttentionCount({
    enrolments: [{ status: "completed" }, { status: "abandoned" }],
    attendance: [{ status: "pending" }, { status: "present" }],
    assessments: [{ outcome: "pending" }, { outcome: "achieved" }],
    learnerFeedback: [],
    stakeholderFeedback: [],
  });
  assert.deepEqual(count, { pendingAttendance: 1, pendingAssessments: 1, abandoned: 1, noSatisfaction: 1, count: 4 });
  const withFeedback = getIndicatorAttentionCount({
    enrolments: [{ status: "completed" }], attendance: [], assessments: [],
    learnerFeedback: [{ overall_rating: 4 }], stakeholderFeedback: [],
  });
  assert.equal(withFeedback.count, 0);
});

test("indicateurs : validation de l'OF avant toute lecture service-role et aucune écriture métier", async () => {
  const source = await readFile(new URL("../src/app/agent/daily/indicateurs/page.tsx", import.meta.url), "utf8");
  const scope = source.indexOf("getDailyOrganisationIdsForAgent(auth.email)");
  const selection = source.indexOf("resolveIndicatorOrganisationSelection(params?.organisation_id, organisationIds)");
  const denied = source.indexOf("if (!selection.valid)");
  const firstRead = source.indexOf('.from("organisations")');
  assert.ok(scope >= 0 && scope < selection && selection < denied && denied < firstRead);
  assert.match(source, /filterIndicatorRowsByOrganisation\(sessionsResult\.data \?\? \[\], selectedOrganisationId\)/);
  assert.match(source, /filterIndicatorOrganisations\(organisations, query, view, attentionByOrg\)/);
  assert.match(source, /aria-label="Filtrer les indicateurs formation"/);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});
