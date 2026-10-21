import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20261021093000_daily_posttraining_correction_resubmission.sql",
  import.meta.url,
);

test("AR1 crée une nouvelle version après une correction demandée, même avec la même empreinte", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(
    migration,
    /v_previous\.metadata->>'source_fingerprint' = v_fingerprint[\s\S]*v_previous\.status <> 'correction_requested'[\s\S]*'created', false/,
  );
  assert.match(migration, /select coalesce\(max\(version\), 0\) \+ 1 into v_version/);
  assert.match(migration, /v_version, 'to_check'/);
  assert.match(migration, /is_current, previous_document_id, metadata[\s\S]*true, v_previous\.id/);
});

test("AR1 conserve la déduplication idempotente hors rejet et les garde-fous de sécurité", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /status not in \('cancelled', 'archived'\)/);
  assert.match(migration, /status not in \('declined', 'cancelled', 'abandoned'\)/);
  assert.match(migration, /revoke all on function public\.daily_register_posttraining_document/);
  assert.match(migration, /grant execute on function public\.daily_register_posttraining_document[\s\S]*to service_role/);
  assert.doesNotMatch(migration.split("create or replace function")[0], /\b(?:update|insert|delete)\s+public\./i);
});
