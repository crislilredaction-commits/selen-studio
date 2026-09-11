import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("src/app/agent/daily/session-dossiers/[id]/satisfaction/page.tsx", "utf8");

test("la satisfaction propose un passage explicite vers le suivi qualité", () => {
  assert.match(source, /Passer du constat au suivi qualité/);
  assert.match(source, /\/agent\/daily\/qualite\?/);
  assert.match(source, /source: "satisfaction"/);
  assert.match(source, /session_id: sessionId/);
  assert.match(source, /organisation_id: organisationId/);
});

test("le raccord conserve une qualification humaine avant création qualité", () => {
  assert.match(source, /ne crée aucune réclamation ni action corrective automatiquement/);
  assert.match(source, /l’agent qualifie d’abord le constat/);
  assert.match(source, /\/agent\/daily\/reclamations/);
});
