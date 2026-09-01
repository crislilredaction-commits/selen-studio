import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../src/app/agent/daily/organisations/page.tsx", import.meta.url),
  "utf8",
);

test("le compteur des points à traiter inclut les organismes non assignés", () => {
  assert.match(source, /new Set\(assignments\.map\(\(assignment\) => assignment\.organisation_id\)\)/);
  assert.match(source, /unassignedOrganisationCount = organisations\.filter/);
  assert.match(source, /!assignedOrganisationIds\.has\(organisation\.id\)/);
  assert.match(
    source,
    /checklist\.filter\(\(item\) => isAttentionStatus\(item\.status\)\)\.length \+ unassignedOrganisationCount/,
  );
});

test("l'assignation affichée reste issue de daily_organisation_assignments", () => {
  assert.match(source, /from\("daily_organisation_assignments"\)/);
  assert.match(source, /agentLabel\(assignment\)/);
  assert.match(source, /Non assigné/);
});
