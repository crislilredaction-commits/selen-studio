import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  normalizeStakeholderFeedbackFilters, stakeholderFeedbackStage,
  countStakeholderFeedbackStages, filterStakeholderFeedbackRows,
} from "../src/lib/daily/stakeholderFeedbackTriage.mjs";

const source = readFileSync(new URL("../src/app/agent/daily/reclamations/page.tsx", import.meta.url), "utf8");
const row = (id, fields = {}) => ({
  item: { id, subject: id, message: "", submission_type: "complaint", status: "received", created_at: "2026-10-24T09:00:00Z", ...fields },
  organisation: { legal_name: "École Étoile" },
  resolved: false,
});

test("triage : paramètres limités, valeurs inconnues refusées", () => {
  assert.deepEqual(normalizeStakeholderFeedbackFilters({ q: " x".repeat(90), etape: "unknown", type: "suggestion" }), {
    q: " x".repeat(90).trim().slice(0, 80), stage: "all", type: "suggestion",
  });
  assert.deepEqual(normalizeStakeholderFeedbackFilters({}), { q: "", stage: "all", type: "all" });
});

test("triage : recherche sans accents ni différence de casse, avec espaces multiples", () => {
  const rows = [row("A", { subject: "Réclamation sécurité" }), row("B", { subject: "Délais" })];
  assert.deepEqual(filterStakeholderFeedbackRows(rows, normalizeStakeholderFeedbackFilters({ q: "securite" })).map(r => r.item.id), ["A"]);
  assert.equal(filterStakeholderFeedbackRows(rows, normalizeStakeholderFeedbackFilters({ q: "ecole  etoile" })).length, 2);
  assert.equal(filterStakeholderFeedbackRows(rows, normalizeStakeholderFeedbackFilters({ q: "inexistant" })).length, 0);
});

test("triage : étapes canoniques, dates et statuts historiques", () => {
  assert.equal(stakeholderFeedbackStage(row("a")), "review");
  assert.equal(stakeholderFeedbackStage(row("b", { status: "reviewed_by_selen" })), "forward");
  assert.equal(stakeholderFeedbackStage(row("c", { forwarded_at: "2026-10-25" })), "response");
  assert.equal(stakeholderFeedbackStage(row("d", { organisation_response: "Corrigé" })), "close");
  assert.equal(stakeholderFeedbackStage(row("e", { resolved_at: "2026-10-26" })), "resolved");
  assert.equal(stakeholderFeedbackStage(row("f", { status: "resolved" })), "resolved");
});

test("triage : compteurs, plaintes prioritaires et filtres par étape/type", () => {
  const rows = [row("closed", { status: "resolved" }), row("suggestion", { submission_type: "suggestion" }),
    row("response", { forwarded_at: "2026-10-25" }), row("review"), row("close", { organisation_response: "OK" }),
    row("forward", { selen_reviewed_at: "2026-10-25" })];
  assert.deepEqual(countStakeholderFeedbackStages(rows), { all: 6, review: 2, forward: 1, response: 1, close: 1, resolved: 1 });
  assert.deepEqual(filterStakeholderFeedbackRows(rows, normalizeStakeholderFeedbackFilters({})).map(r => r.item.id),
    ["review", "suggestion", "forward", "response", "close", "closed"]);
  assert.deepEqual(filterStakeholderFeedbackRows(rows, normalizeStakeholderFeedbackFilters({ etape: "review", type: "suggestion" })).map(r => r.item.id), ["suggestion"]);
});

test("triage : données inchangées et filtrage strictement après le périmètre agent", () => {
  const rows = Object.freeze([Object.freeze(row("A"))]);
  assert.equal(filterStakeholderFeedbackRows(rows, normalizeStakeholderFeedbackFilters({})).length, 1);
  assert.equal(rows[0].item.id, "A");
  assert.match(source, /getDailyOrganisationIdsForAgent\(auth.email\)/);
  assert.match(source, /\.from\("daily_stakeholder_feedback"\)[\s\S]*\.in\("organisation_id", organisationIds\)/);
  assert.ok(source.indexOf("const rows =") < source.indexOf("filterStakeholderFeedbackRows(rows, filters)"));
  assert.doesNotMatch(source, /\.(insert|update|delete|upsert)\(/);
});
