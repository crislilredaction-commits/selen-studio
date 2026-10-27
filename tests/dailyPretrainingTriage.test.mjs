import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  matchesPretrainingDocument, matchesPretrainingReviewStep,
  normalizePretrainingQuery, pretrainingPriority,
} from "../src/lib/daily/pretrainingDocumentTriage.mjs";

const doc = (overrides = {}) => ({
  document_type: "training_agreement", logical_name: "Convention",
  organisations: { name: "École du Sud" },
  session_id: "session-a",
  metadata: { learner_name: "Élodie Martin", session_title: "Formation électricité", secret: "jeton-prive" },
  ...overrides,
});

test("recherche préformation accent-insensible sur libellés autorisés", () => {
  assert.equal(matchesPretrainingDocument(doc(), " ECOLE "), true);
  assert.equal(matchesPretrainingDocument(doc(), "elodie"), true);
  assert.equal(matchesPretrainingDocument(doc(), "electricite"), true);
  assert.equal(matchesPretrainingDocument(doc(), "convention"), true);
  assert.equal(matchesPretrainingDocument(doc(), "centre inconnu"), false);
});

test("aucune recherche dans les champs libres sensibles ni identités d'autres dossiers", () => {
  assert.equal(matchesPretrainingDocument(doc(), "jeton-prive"), false);
  assert.equal(matchesPretrainingDocument(doc({ metadata: null, organisations: null }), "elodie"), false);
  assert.equal(matchesPretrainingDocument(doc({ metadata: null, organisations: null }), ""), true);
});

test("recherche bornée à 80 caractères, tableaux et entrées invalides neutralisés", () => {
  assert.equal(normalizePretrainingQuery("x".repeat(140)).length, 80);
  assert.equal(normalizePretrainingQuery(["  École", "autre"]), "École");
  assert.equal(normalizePretrainingQuery({ query: "secret" }), "");
  assert.equal(normalizePretrainingQuery(null), "");
});

test("étapes fermées : relecture, publication, correction et historique", () => {
  assert.deepEqual(["to_check", "to_validate", "validated", "correction_requested", "published"].filter(s => matchesPretrainingReviewStep(s, "review")), ["to_check", "to_validate"]);
  assert.deepEqual(["to_check", "validated", "published"].filter(s => matchesPretrainingReviewStep(s, "publish")), ["validated"]);
  assert.equal(matchesPretrainingReviewStep("correction_requested", "correction"), true);
  assert.equal(matchesPretrainingReviewStep("published", "correction"), false);
  assert.equal(matchesPretrainingReviewStep("validated", "bogus"), false);
  assert.equal(matchesPretrainingReviewStep("published", "all"), true);
});

test("priorités : relecture avant publication, correction et archives", () => {
  const states = ["published", "correction_requested", "validated", "to_validate", "to_check", "archived"];
  assert.deepEqual([...states].sort((a, b) => pretrainingPriority(a) - pretrainingPriority(b)), ["to_validate", "to_check", "validated", "correction_requested", "published", "archived"]);
});

test("la refonte filtre après la lecture autorisée, sans nouveau circuit d'écriture", () => {
  const page = readFileSync(new URL("../src/app/agent/daily/pretraining-documents/page.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../src/app/agent/api/daily/pretraining-documents/route.ts", import.meta.url), "utf8");
  assert.match(route, /requireSupportAgent\(\)/);
  assert.match(route, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(route, /\.in\("organisation_id", organisationIds\)/);
  assert.match(page, /matchesPretrainingDocument\(d,query\)/);
  assert.match(page, /matchesPretrainingReviewStep\(d\.status,stepFilter\)/);
  assert.match(page, /pretrainingPriority\(a\.status\)-pretrainingPriority\(b\.status\)/);
  assert.match(page, /aria-label="Rechercher les documents préformation"/);
  assert.match(page, /aria-label="Filtrer par type de pièce"/);
  assert.match(page, /aria-label="Filtrer par étape de revue"/);
  assert.match(page, /Réinitialiser les filtres/);
  assert.match(page, /hasUnavailableCanonicalSession\(document,knownSessionIds\)/);
  assert.match(page, /expected_updated_at:doc\.updated_at/);
  assert.match(page, /actionPending\.current/);
});
