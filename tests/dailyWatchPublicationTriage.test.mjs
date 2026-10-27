import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildWatchPublicationRows, filterWatchPublicationRows, normalizeWatchPublicationQuery, normalizeWatchPublicationCategory, normalizeWatchPublicationView, watchPublicationMetrics } from "../src/lib/daily/watchPublicationTriage.mjs";

const watch = (id, title, type = "regulatory", status = "active", date = "2026-10-01") => ({ id, title, watch_type: type, status, published_at: date, article_url: "https://example.org/" + id });

test("paramètres GET bornés et listes fermées", () => {
  assert.equal(normalizeWatchPublicationQuery(["  École  ", "second"]), "École");
  assert.equal(normalizeWatchPublicationQuery("x".repeat(100)).length, 80);
  assert.equal(normalizeWatchPublicationQuery({}), "");
  assert.equal(normalizeWatchPublicationCategory("admin"), "all");
  assert.equal(normalizeWatchPublicationView(["to_apply", "archived"]), "to_apply");
});

test("comptages uniques par organisme et sans contamination inter-veilles", () => {
  const rows = buildWatchPublicationRows([watch("a", "A"), watch("b", "B")], [
    { watch_entry_id: "a", organisation_id: "of1", interested: true, forced_by_studio: false },
    { watch_entry_id: "a", organisation_id: "of1", interested: true, forced_by_studio: true },
    { watch_entry_id: "a", organisation_id: "of2", interested: true, forced_by_studio: false },
    { watch_entry_id: "b", organisation_id: "of3", interested: true, forced_by_studio: false },
  ]);
  assert.deepEqual(rows.map(({ interested, applied, pending }) => [interested, applied, pending]), [[2, 1, 1], [1, 0, 1]]);
});

test("les lignes sans identifiant d'organisme ne deviennent pas des preuves", () => {
  const rows = buildWatchPublicationRows([watch("a", "A")], [{ watch_entry_id: "a", interested: true, forced_by_studio: true }]);
  assert.deepEqual([rows[0].interested, rows[0].applied, rows[0].pending], [0, 0, 0]);
});

test("recherche accent-insensible par titre et source, filtres catégorie et vue", () => {
  const rows = buildWatchPublicationRows([watch("a", "Émargement"), watch("b", "Pédagogie", "pedagogy_technology")], [
    { watch_entry_id: "a", organisation_id: "of1", interested: true, forced_by_studio: false },
    { watch_entry_id: "b", organisation_id: "of2", interested: true, forced_by_studio: true },
  ]);
  assert.deepEqual(filterWatchPublicationRows(rows, { q: "emargement" }).map((r) => r.watch.id), ["a"]);
  assert.deepEqual(filterWatchPublicationRows(rows, { q: "example.org/b" }).map((r) => r.watch.id), ["b"]);
  assert.deepEqual(filterWatchPublicationRows(rows, { categorie: "pedagogy_technology" }).map((r) => r.watch.id), ["b"]);
  assert.deepEqual(filterWatchPublicationRows(rows, { vue: "to_apply" }).map((r) => r.watch.id), ["a"]);
  assert.deepEqual(filterWatchPublicationRows(rows, { vue: "applied" }).map((r) => r.watch.id), ["b"]);
});

test("archives visibles dans l'historique mais jamais à appliquer", () => {
  const rows = buildWatchPublicationRows([watch("a", "Archivée", "regulatory", "archived")], [{ watch_entry_id: "a", organisation_id: "of1", interested: true }]);
  assert.equal(filterWatchPublicationRows(rows, { vue: "to_apply" }).length, 0);
  assert.equal(filterWatchPublicationRows(rows, { vue: "archived" }).length, 1);
  assert.deepEqual(watchPublicationMetrics(rows), { total: 1, toApply: 0, applied: 0, archived: 1 });
});

test("priorisation des veilles à exploiter, historique conservé, source immuable", () => {
  const source = [watch("done", "Exploitée"), watch("arch", "Archivée", "regulatory", "archived"), watch("pending", "À traiter")];
  const snapshot = JSON.stringify(source);
  const rows = buildWatchPublicationRows(source, [
    { watch_entry_id: "done", organisation_id: "of1", interested: true, forced_by_studio: true },
    { watch_entry_id: "pending", organisation_id: "of2", interested: true },
  ]);
  assert.deepEqual(filterWatchPublicationRows(rows).map((r) => r.watch.id), ["pending", "done", "arch"]);
  assert.equal(JSON.stringify(source), snapshot);
});

test("la page filtre après les lectures bornées et conserve les actions sécurisées", () => {
  const page = readFileSync(new URL("../src/app/agent/daily/qualite/page.tsx", import.meta.url), "utf8");
  assert.match(page, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(page, /\.in\("organisation_id", dailyOrganisationIds\)/);
  assert.match(page, /buildWatchPublicationRows\(watches \?\? \[\], usageRows\)/);
  assert.match(page, /filterWatchPublicationRows\(publicationRows, \{ q, categorie, vue \}\)/);
  assert.match(page, /name="q"/);
  assert.match(page, /name="categorie"/);
  assert.match(page, /name="vue"/);
  assert.match(page, /action=\{createWatch\}/);
  assert.match(page, /action=\{forceUsage\}/);
});
