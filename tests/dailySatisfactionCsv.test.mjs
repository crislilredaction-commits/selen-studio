import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDailySatisfactionCsv } from "../src/lib/daily/dailySatisfactionCsv.mjs";

const row = (overrides = {}) => ({
  formation: "Initiation", organisation: "OF test", reference: "REF-1",
  startDate: "2026-10-01", endDate: "2026-10-03",
  expectedLearners: 3, learnerDone: 2, missingLearners: 1,
  companyDone: 1, trainerDone: 0, clientDone: 0, ...overrides,
});

test("export satisfaction : BOM UTF-8, séparateur FR, onze colonnes et CRLF", () => {
  const csv = createDailySatisfactionCsv([row()]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.equal(csv.trimEnd().split("\r\n").length, 2);
  assert.equal(csv.split("\r\n")[0].split(";").length, 11);
  assert.match(csv, /"Initiation";"OF test";"REF-1"/);
  assert.match(csv, /;"3";"2";"1";"1";"0";"0"/);
});

test("export satisfaction : échappement CSV des séparateurs, guillemets et retours ligne", () => {
  const csv = createDailySatisfactionCsv([row({ formation: 'A;"B"\nC' })]);
  assert.match(csv, /"A;""B""\nC"/);
});

test("export satisfaction : neutralise les formules tableur même précédées d'espaces", () => {
  const csv = createDailySatisfactionCsv([row({
    formation: "=1+1", organisation: "  +IMPORT", reference: "@cmd",
  })]);
  assert.match(csv, /"'=1\+1"/);
  assert.match(csv, /"'  \+IMPORT"/);
  assert.match(csv, /"'@cmd"/);
});

test("export satisfaction : liste vide n'exporte que l'entête", () => {
  const csv = createDailySatisfactionCsv([]);
  assert.equal(csv.trimEnd().split("\r\n").length, 1);
});

test("export satisfaction : seulement les lignes filtrées et autorisées, aucune mutation", async () => {
  const page = await readFile(new URL("../src/app/agent/daily/satisfaction/page.tsx", import.meta.url), "utf8");
  const component = await readFile(new URL("../src/components/daily/DailySatisfactionCsvExport.tsx", import.meta.url), "utf8");
  assert.match(page, /requireSupportAgent\(\)/);
  assert.match(page, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(page, /filterDailySatisfactionRows\(rows,/);
  assert.match(page, /rows=\{visibleRows\.map\(/);
  assert.doesNotMatch(page + component, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  assert.doesNotMatch(component, /fetch\(|XMLHttpRequest|localStorage/);
});
