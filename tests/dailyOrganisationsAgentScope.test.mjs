import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const page = () => readFile(new URL("../src/app/agent/daily/organisations/page.tsx", import.meta.url), "utf8");
const scope = () => readFile(new URL("../src/lib/server/dailyOrganisationScope.ts", import.meta.url), "utf8");

test("organismes : le périmètre agent est résolu après authentification, avant les lectures", async () => {
  const source = await page();
  const auth = source.indexOf("const auth = await requireSupportAgent()");
  const agentScope = source.indexOf("getDailyOrganisationIdsForAgent(auth.email)");
  const organisations = source.indexOf('.from("organisations")');
  assert.ok(auth >= 0 && auth < agentScope && agentScope < organisations);
  assert.doesNotMatch(source, /getActiveDailyOrganisationIds/);
  assert.match(source, /Erreur Daily : \{error instanceof Error \? error.message : "périmètre Daily indisponible"\}/);
});

test("organismes : les cinq lectures principales sont bornées aux organismes autorisés", async () => {
  const source = await page();
  for (const table of ["organisations", "daily_organisation_assignments", "daily_formations", "daily_organisation_profile_change_requests", "daily_trainer_profiles"]) {
    const section = source.split('.from("' + table + '")')[1]?.split("\n      admin")[0] ?? "";
    assert.match(section, /\.in\("(id|organisation_id)", scopeIds\)/, table);
  }
  assert.match(source, /const scopeIds = dailyOrganisationIds.length[\s\S]*00000000-0000-0000-0000-000000000000/);
  assert.match(source, /if \(firstError\)/);
});

test("organismes : les certifications sont limitées aux formateurs autorisés, jamais globales", async () => {
  const source = await page();
  const trainerScope = source.indexOf("const trainerIds = trainers.map");
  const certifications = source.indexOf('.from("daily_trainer_certifications")');
  assert.ok(trainerScope > 0 && certifications > trainerScope);
  assert.match(source, /trainerIds.length[\s\S]*\.in\("trainer_profile_id", trainerIds\)/);
  assert.match(source, /if \(certificationsError\)/);
  assert.match(source, /: \{ data: \[\] as CertificationRow\[\], error: null \}/);
});

test("organismes : les admins conservent le périmètre global, les agents uniquement leurs affectations", async () => {
  const source = await scope();
  assert.match(source, /if \(adminUser\?\.role === "admin" \|\| profile\?\.role === "admin"\)/);
  assert.match(source, /if \(!profile\?\.id \|\| profile\.role !== "agent"\) return \[\]/);
  assert.match(source, /\.eq\("agent_profile_id", profile\.id\)/);
  assert.match(source, /activeSet\.has\(organisationId\)/);
});

test("organismes : lecture seule, statistiques et navigation existantes conservées", async () => {
  const source = await page();
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  assert.match(source, /dailyOrganisationTaskCounts\(attentionTasks\)/);
  assert.match(source, /dailyOrganisationProgramStats\(formations\.filter/);
  assert.match(source, /href=\{\`\/agent\/daily\/organisations\/\$\{organisation\.id\}\`\}/);
});
