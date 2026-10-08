import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [page, overview, migration] = await Promise.all([
  readFile(new URL("../src/app/agent/daily/session-dossiers/[id]/followup/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/agent/daily/suivi-sessions/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20261008001130_daily_followup_entry_types.sql", import.meta.url), "utf8"),
]);

test("P4 Studio validates enrolment scope and excludes terminal enrolments", () => {
  assert.match(page, /\.eq\("organisation_id", session\.organisation_id\)/);
  assert.match(page, /\.eq\("session_id", sessionId\)/);
  for (const status of ["cancelled", "declined", "abandoned", "completed"]) assert.match(page, new RegExp(status));
  assert.match(page, /activeEnrolments/);
});

test("P4 Studio preserves provenance, idempotence and one-way resolution", () => {
  assert.match(page, /request_id/);
  assert.match(page, /id: requestId/);
  assert.match(page, /error\.code !== "23505"/);
  assert.match(page, /created_by: auth\.userId/);
  assert.match(page, /resolved_by: auth\.userId/);
  assert.match(page, /author_role: "Agent Selen"/);
  assert.match(page, /\.eq\("status", "open"\)/);
  assert.match(page, /refreshFollowupChecklist/);
});

test("P4 operational types share the canonical table and caduc parents leave active counters", () => {
  for (const type of ["incident", "adaptation", "note", "absence", "delay", "abandonment_alert"]) assert.match(migration, new RegExp(`'${type}'`));
  assert.match(overview, /actionable && entry\.status === "open"/);
  assert.match(overview, /Historique — sans action/);
});
