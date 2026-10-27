import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { filterAndPrioritizeProcedures, normalizeProcedureQuery, normalizeProcedureView, procedureOrganisationOptions, selectProcedureOrganisation } from "../src/lib/daily/internalProceduresTriage.mjs";

const makeRow = (id, status, due, organisation = "École Aube", reviewed_at = null) => ({
  procedure: { id, title: id, procedure_type: "absence_dropout", purpose: "Suivi qualité", status, reviewed_at, updated_at: "2026-09-01", internalTypeLabel: "Absences et abandons" },
  organisation: { name: organisation },
  annualReviewDue: due,
});

test("requête limitée à 80 caractères et paramètre vue fermé", () => {
  assert.equal(normalizeProcedureQuery(["  École  ", "inattendu"]), "École");
  assert.equal(normalizeProcedureQuery("x".repeat(100)).length, 80);
  assert.equal(normalizeProcedureQuery({}), "");
  assert.equal(normalizeProcedureView("admin"), "all");
  assert.equal(normalizeProcedureView(["due", "draft"]), "due");
});

test("recherche accent-insensible par organisme, titre, objet et type", () => {
  const rows = [makeRow("Émargement", "active", false, "École Aube")];
  assert.equal(filterAndPrioritizeProcedures(rows, "ecole", "all").length, 1);
  assert.equal(filterAndPrioritizeProcedures(rows, "emargement", "all").length, 1);
  assert.equal(filterAndPrioritizeProcedures(rows, "qualite", "all").length, 1);
  assert.equal(filterAndPrioritizeProcedures(rows, "abandons", "all").length, 1);
  assert.equal(filterAndPrioritizeProcedures(rows, "inconnu", "all").length, 0);
});

test("filtres revues dues, brouillons et actifs distincts", () => {
  const rows = [makeRow("A", "active", true), makeRow("B", "draft", false), makeRow("C", "active", false)];
  assert.deepEqual(filterAndPrioritizeProcedures(rows, "", "due").map((r) => r.procedure.id), ["A"]);
  assert.deepEqual(filterAndPrioritizeProcedures(rows, "", "draft").map((r) => r.procedure.id), ["B"]);
  assert.deepEqual(filterAndPrioritizeProcedures(rows, "", "active").map((r) => r.procedure.id), ["A", "C"]);
});

test("priorité aux revues en retard puis brouillons, sans muter la source", () => {
  const rows = [makeRow("actif", "active", false), makeRow("brouillon", "draft", false), makeRow("retard", "active", true)];
  const snapshot = rows.map((r) => r.procedure.id);
  assert.deepEqual(filterAndPrioritizeProcedures(rows, "", "all").map((r) => r.procedure.id), ["retard", "brouillon", "actif"]);
  assert.deepEqual(rows.map((r) => r.procedure.id), snapshot);
});

test("la recherche ne sort jamais du tableau de lignes déjà autorisées", () => {
  const allowed = [makeRow("A", "active", false, "Organisme affecté")];
  assert.equal(filterAndPrioritizeProcedures(allowed, "autre organisme", "all").length, 0);
  assert.equal(filterAndPrioritizeProcedures(allowed, "organisme affecte", "all").length, 1);
});

test("page : garde agent et périmètre avant filtrage, sans écriture métier", () => {
  const page = readFileSync(new URL("../src/app/agent/daily/procedures-internes/page.tsx", import.meta.url), "utf8");
  assert.match(page, /requireSupportAgent\(\)/);
  assert.match(page, /\.in\("organisation_id", scopedOrganisationIds\)/);
  assert.match(page, /filterAndPrioritizeProcedures\(rows, query, view\)/);
  assert.match(page, /name="q"/);
  assert.match(page, /name="vue"/);
  assert.doesNotMatch(page, /\.(?:insert|upsert|update|delete)\(/);
});

test("organismes proposés : affectation, archive, dédoublonnage et tri", () => {
  const options = procedureOrganisationOptions([
    { id: "b", legal_name: "Zèbre", status: "active" },
    { id: "a", name: "Aube", status: "active" },
    { id: "a", name: "Doublon", status: "active" },
    { id: "c", name: "Hors périmètre", status: "active" },
    { id: "d", name: "Archivé", status: "archived" },
  ], ["a", "b", "d"]);
  assert.deepEqual(options, [{ id: "a", name: "Aube" }, { id: "b", name: "Zèbre" }]);
  assert.equal(selectProcedureOrganisation(undefined, options), "");
  assert.equal(selectProcedureOrganisation("a", options), "a");
  assert.equal(selectProcedureOrganisation(["b", "a"], options), "b");
  for (const invalid of ["c", "d", "intrus", {}, null]) {
    assert.equal(selectProcedureOrganisation(invalid, options), null);
  }
});

test("page : le choix organisme est validé avant la lecture et borne les compteurs", () => {
  const page = readFileSync(new URL("../src/app/agent/daily/procedures-internes/page.tsx", import.meta.url), "utf8");
  assert.match(page, /name="organisme"/);
  assert.match(page, /\.neq\("status", "archived"\)/);
  assert.match(page, /selectProcedureOrganisation\(params\?\.organisme, organisationOptions\)/);
  assert.match(page, /selectedOrganisation === null/);
  assert.match(page, /\.in\("organisation_id", scopedOrganisationIds\)/);
  assert.ok(page.indexOf("selectedOrganisation === null") < page.indexOf('from("daily_internal_procedures")'));
  assert.ok(page.indexOf('in("organisation_id", scopedOrganisationIds)') < page.indexOf("const activeCount"));
  assert.match(page, /search\.set\("organisme", selectedOrganisation\)/);
  assert.doesNotMatch(page, /\.(?:insert|upsert|update|delete)\(/);
});
