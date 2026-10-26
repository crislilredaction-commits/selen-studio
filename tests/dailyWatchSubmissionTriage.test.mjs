import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  filterWatchSubmissions,
  isWatchSubmissionOverdue,
  normalizeWatchSubmissionQuery,
  normalizeWatchSubmissionCategory,
  normalizeWatchSubmissionView,
  watchSubmissionMetrics,
} from "../src/lib/daily/watchSubmissionTriage.mjs";

const now = new Date("2026-10-27T00:00:00.000Z");
const rows = [
  { id: "a", organisation_id: "allowed", watch_type: "regulatory", title: "Décret qualité", summary: "Contrôle", source_url: "https://exemple.fr", created_at: "2026-10-10T00:00:00Z", organisations: { legal_name: "École Élégante" } },
  { id: "b", organisation_id: "allowed", watch_type: "pedagogy", title: "Nouveauté pédagogique", summary: "Méthodes", created_at: "2026-10-26T00:00:00Z", organisations: { name: "Formation Soleil" } },
  { id: "c", organisation_id: "allowed", watch_type: "technology", title: "Outils", analysis_and_improvement: "Accessibilité", created_at: "2026-10-19T00:00:00Z", organisations: [{ name: "Campus Aube" }] },
];

test("veille : recherche accent-insensible dans titre, organisme, résumé et analyse", () => {
  assert.deepEqual(filterWatchSubmissions(rows, { q: "ECOLE" }, now).map((row) => row.id), ["a"]);
  assert.deepEqual(filterWatchSubmissions(rows, { q: "accessibilite" }, now).map((row) => row.id), ["c"]);
  assert.deepEqual(filterWatchSubmissions(rows, { q: "methodes" }, now).map((row) => row.id), ["b"]);
});

test("veille : catégories et vues inconnues sont ramenées à toutes", () => {
  assert.equal(normalizeWatchSubmissionCategory("hacked"), "all");
  assert.equal(normalizeWatchSubmissionView("hacked"), "all");
  assert.deepEqual(filterWatchSubmissions(rows, { categorie: "regulatory" }, now).map((row) => row.id), ["a"]);
  assert.deepEqual(filterWatchSubmissions(rows, { categorie: "other" }, now).map((row) => row.id), ["c", "b"]);
});

test("veille : retard calculé sur 7 jours, sans traiter les dates invalides", () => {
  assert.equal(isWatchSubmissionOverdue(rows[0], now), true);
  assert.equal(isWatchSubmissionOverdue(rows[1], now), false);
  assert.equal(isWatchSubmissionOverdue({ created_at: "incorrect" }, now), false);
  assert.deepEqual(filterWatchSubmissions(rows, { vue: "overdue" }, now).map((row) => row.id), ["a", "c"]);
});

test("veille : requêtes bornées et paramètres multiples sans exception", () => {
  assert.equal(normalizeWatchSubmissionQuery([" x ".repeat(100), "ignore"]).length, 80);
  assert.equal(normalizeWatchSubmissionQuery({ unexpected: true }), "");
  assert.deepEqual(filterWatchSubmissions(rows, { q: "aucun" }, now), []);
});

test("veille : compteurs globaux et liste source non mutée", () => {
  const before = rows.map((row) => row.id);
  assert.deepEqual(watchSubmissionMetrics(rows, now), { total: 3, overdue: 2, regulatory: 1 });
  filterWatchSubmissions(rows, {}, now);
  assert.deepEqual(rows.map((row) => row.id), before);
});

test("veille : filtre appliqué après le bornage canonique et aucune nouvelle lecture service-role", () => {
  const page = readFileSync(new URL("../src/app/agent/daily/veille-proposee/page.tsx", import.meta.url), "utf8");
  const scope = page.indexOf("getDailyOrganisationIdsForAgent(auth.email)", page.indexOf("export default async function"));
  const admin = page.indexOf("createSupabaseAdminClient()", scope);
  const scopedQuery = page.indexOf('.in("organisation_id", dailyOrganisationIds)', admin);
  const filtering = page.indexOf("filterWatchSubmissions(", scopedQuery);
  assert.ok(scope >= 0 && scope < admin && admin < scopedQuery && scopedQuery < filtering);
  assert.doesNotMatch(page.slice(page.indexOf("export default async function")), /\.(?:insert|update|upsert|delete)\(/);
});
