import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/app/agent/daily/organisations/[id]/onboarding-documents/page.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/app/agent/daily/organisations/[id]/layout.tsx", import.meta.url), "utf8");

test("les pièces onboarding sont consultables depuis le dossier Studio", () => {
  assert.match(layout, /onboarding-documents/);
  assert.match(page, /insee_document_url/);
  assert.match(page, /qualiopi_certificate_url/);
  assert.match(page, /nda_or_bpf_document_url/);
  assert.match(page, /Ouvrir la pièce dans Studio/);
});

test("la consultation reste bornée au périmètre Daily de l'agent", () => {
  assert.match(page, /requireSupportAgent/);
  assert.match(page, /isDailyOrganisationInAgentScope\(auth\.email, id\)/);
});

test("aucune copie documentaire parallèle n'est créée", () => {
  assert.doesNotMatch(page, /\.storage\.from\(/);
  assert.doesNotMatch(page, /\.upload\(/);
  assert.match(page, /href=\{piece\.url\}/);
});
