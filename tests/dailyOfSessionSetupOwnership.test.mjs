import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260912231500_daily_session_setup_owned_by_of.sql", import.meta.url),
  "utf8",
);

test("les choix de session de l’OF sont validés automatiquement sans validation Studio", () => {
  assert.match(migration, /create or replace function public\.daily_sync_session_setup_checklist\(\)/);
  assert.match(migration, /item_key = 'schedule_location'/);
  assert.match(migration, /item_key = 'trainer_assignment'/);
  assert.match(migration, /responsibility = 'client'/);
  assert.match(migration, /status = case when schedule_ready then 'validated' else 'todo' end/);
  assert.match(migration, /status = case when trainer_ready then 'validated' else 'todo' end/);
  assert.match(migration, /after insert or update of start_date, end_date, schedule_blocks, location_address, remote_url, modality, trainer_ids/);
});

test("les tâches réservées au client ne créent plus de notification agent ou admin", () => {
  assert.match(migration, /item\.responsibility in \('shared', 'selen'\)/);
  assert.match(migration, /perform public\.daily_sync_session_checklist_notification\(row_item\.id\)/);
});
