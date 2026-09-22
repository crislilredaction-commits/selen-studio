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
  assert.match(page, /path\.startsWith\(\x60daily\/\$\{organisationId\}\/organisation\/\x60\)/);
});

test("les pièces privées utilisent leur stockage canonique sans copie parallèle", () => {
  assert.match(page, /storageObjectPath/);
  assert.match(page, /storage\.from\("documents"\)\.createSignedUrl\(path, 300\)/);
  assert.match(page, /bucket !== "documents"/);
  assert.doesNotMatch(page, /\.upload\(/);
  assert.match(page, /href=\{piece\.url\}/);
});

test("A13 ne réutilise jamais directement une URL publique onboarding", () => {
  assert.doesNotMatch(page, /url: safeDocumentUrl/);
  assert.match(page, /await signedDocumentUrl\(admin, onboarding\.insee_document_url, id\)/);
  assert.match(page, /await signedDocumentUrl\(admin, onboarding\.qualiopi_certificate_url, id\)/);
  assert.match(page, /await signedDocumentUrl\(admin, onboarding\.nda_or_bpf_document_url, id\)/);
});
