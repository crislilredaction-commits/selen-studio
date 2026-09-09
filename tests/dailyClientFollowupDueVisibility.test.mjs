import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/lib/server/studioClientFollowups.ts", import.meta.url), "utf8");

test("une relance future reste cachée de la file Studio", () => {
  assert.match(source, /function isDue/);
  assert.match(source, /if \(!isDue\(row\.due_at\)\) return \[\]/);
});

test("la règle équipe à 72 h reste basée sur la mise en attente sans réassignation", () => {
  assert.match(source, /72 \* 60 \* 60 \* 1000/);
  assert.match(source, /assigned_agent_profile_id/);
  assert.match(source, /staff\.id === agentId \|\| overdueShared/);
  assert.doesNotMatch(source, /daily_organisation_assignments.*update|\.from\("daily_organisation_assignments"\).*\.update/s);
});
