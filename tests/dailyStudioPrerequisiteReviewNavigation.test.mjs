import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const list = readFileSync("src/app/agent/daily/candidatures/page.tsx", "utf8");
const detail = readFileSync("src/app/agent/daily/candidatures/[id]/page.tsx", "utf8");

test("les preuves à revoir ouvrent directement la section prérequis du dossier", () => {
  assert.match(detail, /id="prerequis"/);
  assert.match(list, /counts\.submitted && row\.decision_status === "pending" \? "#prerequis" : ""/);
  assert.match(list, /"Vérifier les justificatifs →"/);
});

test("la priorité de revue reste réservée aux candidatures non analysées", () => {
  assert.match(list, /a\.decision_status === "pending" && \(evidenceByRequest\.get\(a\.id\)\?\.submitted \?\? 0\) > 0/);
  assert.match(list, /"Consulter l’analyse →"/);
});
