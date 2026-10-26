import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  normalizeSessionFollowupFilters, sessionFollowupState,
  countSessionFollowupStates, filterSessionFollowupRows,
} from "../src/lib/daily/sessionFollowupFilters.mjs";

const source = readFileSync(new URL("../src/app/agent/daily/suivi-sessions/page.tsx", import.meta.url), "utf8");
const row = (id, { status = "open", level = "info", type = "note", actionable = true, date = "2026-10-25T10:00:00Z" } = {}) => ({
  entry: { id, summary: id, status, level, entry_type: type, occurred_at: date },
  session: { internal_reference: "SESSION-ÉTÉ" },
  formation: { title: "Sécurité" },
  organisation: { name: "École Alpha" },
  actionable,
});

test("filtres : paramètres bornés et valeurs inconnues rejetées", () => {
  assert.deepEqual(normalizeSessionFollowupFilters({ q: [" été ".repeat(30)], etat: "oops", niveau: "critical", type: "incident" }), {
    q: "été ".repeat(30).trim().slice(0, 80), state: "all", level: "critical", type: "incident",
  });
  assert.deepEqual(normalizeSessionFollowupFilters({}), { q: "", state: "all", level: "all", type: "all" });
});

test("filtres : recherche insensible aux accents sur organisme, formation et référence", () => {
  const rows = [row("A"), row("B")];
  assert.deepEqual(filterSessionFollowupRows(rows, normalizeSessionFollowupFilters({ q: "securite" })).map((r) => r.entry.id), ["A", "B"]);
  assert.equal(filterSessionFollowupRows(rows, normalizeSessionFollowupFilters({ q: "session-ete" })).length, 2);
  assert.equal(filterSessionFollowupRows(rows, normalizeSessionFollowupFilters({ q: "introuvable" })).length, 0);
});

test("filtres : état historique et résolu distincts de l'ouvert actionnable", () => {
  const rows = [row("open"), row("resolved", { status: "resolved" }), row("history", { actionable: false })];
  assert.deepEqual(countSessionFollowupStates(rows), { all: 3, open: 1, resolved: 1, history: 1 });
  assert.equal(sessionFollowupState(rows[2]), "history");
  assert.deepEqual(filterSessionFollowupRows(rows, normalizeSessionFollowupFilters({ etat: "history" })).map((r) => r.entry.id), ["history"]);
});

test("filtres : priorité critique ouverte, puis attention, puis résolution et historique", () => {
  const rows = [
    row("history", { actionable: false, level: "critical" }),
    row("resolved", { status: "resolved", level: "critical" }),
    row("info"), row("critical", { level: "critical" }), row("attention", { level: "attention" }),
  ];
  assert.deepEqual(filterSessionFollowupRows(rows, normalizeSessionFollowupFilters({})).map((r) => r.entry.id),
    ["critical", "attention", "info", "resolved", "history"]);
  assert.deepEqual(filterSessionFollowupRows(rows, normalizeSessionFollowupFilters({ niveau: "critical", type: "note" })).map((r) => r.entry.id),
    ["critical", "resolved", "history"]);
});

test("filtres : source immuable et périmètre agent appliqué avant tout filtre", () => {
  const rows = Object.freeze([Object.freeze(row("A"))]);
  assert.equal(filterSessionFollowupRows(rows, normalizeSessionFollowupFilters({})).length, 1);
  assert.equal(rows[0].entry.id, "A");
  const scope = source.indexOf("buildScopedSessionFollowupRows(");
  const filters = source.indexOf("filterSessionFollowupRows(rows, filters)");
  assert.ok(scope >= 0 && filters > scope);
  assert.match(source, /getDailyOrganisationIdsForAgent\(auth.email\)/);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});
