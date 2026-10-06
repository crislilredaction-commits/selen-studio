import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("A10 ne crée un accès délégué que pour un portail apprenant/formateur du même OF", () => {
  const tokens = read("src/lib/server/agentAssistanceTokens.ts");
  assert.match(tokens, /daily_portal_access_tokens/);
  assert.match(tokens, /daily_sessions!inner\(organisation_id, status\)/);
  assert.match(tokens, /\.eq\("daily_sessions\.organisation_id", organisationId\)/);
  assert.match(tokens, /\.in\("portal_type", \["learner", "trainer"\]\)/);
  assert.match(tokens, /scope: "portal_preview"/);
  assert.match(tokens, /portal_access_id: portalAccessId/);
});

test("A10 expose la délégation depuis le dossier OF sans révéler le token personnel", () => {
  const page = read("src/app/agent/daily/organisations/[id]/page.tsx");
  assert.match(page, /Espaces apprenant et formateur délégués/);
  assert.match(page, /Consultation sûre dans le contexte de cet OF/);
  assert.match(page, /portal_access_id/);
  assert.doesNotMatch(page, /select\([^\n]*token[,\)]/);
  assert.match(page, /Consulter en délégation/);
});
