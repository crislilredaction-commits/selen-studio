import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260915010000_daily_checklist_monotonic_completion.sql", import.meta.url),
  "utf8",
);

for (const functionName of [
  "daily_maintain_session_checklist_timestamps",
  "daily_maintain_checklist_timestamps",
]) {
  test(`${functionName} interdit une réouverture silencieuse`, () => {
    const start = migration.indexOf(`function public.${functionName}()`);
    assert.notEqual(start, -1);
    const body = migration.slice(start, start + 2600);
    assert.match(body, /old\.status in \('validated','not_applicable'\)/);
    assert.match(body, /new\.status not in \('validated','not_applicable'\)/);
    assert.match(body, /new\.status := old\.status/);
    assert.match(body, /new\.completed_at := old\.completed_at/);
    assert.match(body, /new\.validated_by := old\.validated_by/);
  });

  test(`${functionName} capture date et auteur de validation`, () => {
    const start = migration.indexOf(`function public.${functionName}()`);
    const body = migration.slice(start, start + 2600);
    assert.match(body, /new\.completed_at := coalesce\(old\.completed_at, now\(\)\)/);
    assert.match(body, /new\.validated_by := coalesce\(new\.validated_by, auth\.uid\(\), old\.validated_by\)/);
  });
}

test("la synchronisation dates/formateur ne rétrograde pas une ligne terminale", () => {
  const start = migration.indexOf("function public.daily_sync_session_setup_checklist()");
  assert.notEqual(start, -1);
  const body = migration.slice(start);
  assert.match(body, /when status in \('validated','not_applicable'\) then status/g);
  assert.match(body, /when schedule_ready then 'validated'/);
  assert.match(body, /when trainer_ready then 'validated'/);
});
