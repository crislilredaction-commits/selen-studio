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

test("A10 fusionne la délégation dans l'unique répertoire Espaces apprenants sans révéler le token", () => {
  const page = read("src/app/agent/daily/organisations/[id]/page.tsx");
  assert.doesNotMatch(page, /Espaces apprenant et formateur délégués/);
  assert.match(page, /label: "Espaces apprenants"/);
  assert.match(page, /portal_access_id/);
  assert.doesNotMatch(page, /select\([^\n]*token[,\)]/);
  assert.match(page, /Consulter en délégation/);
  assert.match(page, /Renvoyer l’accès/);
});

test("le renvoi Studio est borné au même OF, historisé et protégé contre le double clic", () => { const direct=read("src/lib/server/dailyDirectSessionPortalAccess.ts");assert.match(direct,/daily_sessions!inner\(organisation_id/);assert.match(direct,/daily_sessions\.organisation_id/);assert.match(direct,/daily_communications/);assert.match(direct,/studio_manual_resend/);assert.match(direct,/Date\.now\(\) - 60_000/);assert.match(direct,/Le destinataire ne correspond plus à l’apprenant rattaché/); });
