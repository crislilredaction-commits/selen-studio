import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../src/app/agent/api/daily/organisation-assignment/route.ts", import.meta.url), "utf8");
const pilotage = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
const organisationLayout = await readFile(new URL("../src/app/agent/daily/organisations/[id]/layout.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260809002121_daily_lot1b2_studio_pilotage.sql", import.meta.url), "utf8");

test("un agent non-admin ne peut prendre qu’un organisme non assigné pour lui-même", () => {
  assert.match(route, /requireSupportAgent\(\)/);
  assert.match(route, /targetAgentProfileId = profile\.id/);
  assert.match(route, /requestedAgentProfileId !== profile\.id/);
  assert.match(route, /Un agent ne peut assigner un organisme qu’à lui-même/);
  assert.match(route, /existing && existing\.agent_profile_id !== profile\.id/);
  assert.match(route, /Seul un administrateur peut le réassigner/);
});

test("la prise en charge agent reste un INSERT et ne peut pas devenir une réassignation par course", () => {
  assert.match(route, /const write = isAdmin/);
  assert.match(route, /\? await admin\.from\("daily_organisation_assignments"\)\.upsert\(payload/);
  assert.match(route, /: await admin\.from\("daily_organisation_assignments"\)\.insert\(payload\)/);
  assert.match(route, /write\.error\.code === "23505"/);
  assert.match(route, /vient d’être assigné\. Seul un administrateur peut le réassigner/);
});

test("un admin peut choisir un agent cible éligible et réassigner", () => {
  assert.match(route, /isAdmin/);
  assert.match(route, /targetAgentProfileId = requestedAgentProfileId/);
  assert.match(route, /\.eq\("is_active", true\)/);
  assert.match(route, /\.in\("role", \["agent", "admin"\]\)/);
  assert.match(route, /\.upsert\(payload, \{ onConflict: "organisation_id" \}\)/);
});

test("le Pilotage Daily propose la prise en charge directe aux agents", () => {
  assert.match(pilotage, /role === "admin"/);
  assert.match(pilotage, /action="\/agent\/api\/daily\/organisation-assignment"/);
  assert.match(pilotage, /Me l’assigner →/);
});

test("la fiche organisme propose aussi la prise en charge uniquement si elle est non assignée", () => {
  assert.match(organisationLayout, /daily_organisation_assignments/);
  assert.match(organisationLayout, /!assignmentRes\.data/);
  assert.match(organisationLayout, /profileRes\.data\?\.role === "agent"/);
  assert.match(organisationLayout, /action="\/agent\/api\/daily\/organisation-assignment"/);
  assert.match(organisationLayout, /Me l’assigner/);
});

test("les écritures directes authenticated restent fermées sur la table d’assignation", () => {
  assert.match(migration, /revoke all on table public\.daily_organisation_assignments from public, anon, authenticated/);
  assert.doesNotMatch(migration, /grant insert[^;]*daily_organisation_assignments to authenticated/i);
});
