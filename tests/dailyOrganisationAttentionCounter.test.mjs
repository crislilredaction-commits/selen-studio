import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../src/app/agent/daily/organisations/page.tsx", import.meta.url),
  "utf8",
);

test("le compteur des points à traiter réutilise le pilotage Daily canonique", () => {
  assert.match(source, /getDailyAgentTasks/);
  assert.match(source, /attentionTasks = await getDailyAgentTasks\(\{ id: profile\?\.id \?\? null, role \}\)/);
  assert.match(source, /const totalAttention = attentionTasks\.length/);
  assert.doesNotMatch(source, /unassignedOrganisationCount/);
});

test("le compteur canonique respecte la visibilité de l'agent courant", () => {
  assert.match(source, /from\("agent_profiles"\)\.select\("id,role"\)/);
  assert.match(source, /from\("selen_admin_users"\)\.select\("role"\)/);
  assert.match(source, /const role = \(adminUser\?\.role === "admin" \|\| profile\?\.role === "admin"/);
});

test("l'assignation affichée reste issue de daily_organisation_assignments", () => {
  assert.match(source, /from\("daily_organisation_assignments"\)/);
  assert.match(source, /agentLabel\(assignment\)/);
  assert.match(source, /Non assigné/);
});
