import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260912223000_daily_session_phase_notifications.sql", "utf8");
const tasks = readFileSync("src/lib/server/dailyAgentTasks.ts", "utf8");

test("les notifications de session respectent la phase réelle", () => {
  assert.match(migration, /daily_session_checklist_phase_available/);
  assert.match(migration, /item\.signaled_at is not null/);
  assert.match(migration, /daily_session_checklist_phase_available\(item\.session_id, item\.phase\)/);
  assert.match(migration, /set signaled_at = null/);
  assert.match(migration, /paris_today > session_end/);
});

test("le réveil des tâches de phase est idempotent et sans cron", () => {
  assert.match(migration, /daily_refresh_session_checklist_notifications/);
  assert.match(migration, /where item\.signaled_at is null/);
  assert.match(migration, /perform public\.daily_sync_session_checklist_notification/);
  assert.doesNotMatch(migration, /cron\.schedule|pg_cron/i);
});

test("les notifications de checklist pointent vers l'action utile", () => {
  assert.match(migration, /quality_analysis_review[\s\S]*\/followup/);
  assert.match(migration, /selen_closure_review[\s\S]*\/closure/);
  assert.match(migration, /posttraining_documents[\s\S]*\/agent\/daily\/posttraining-documents/);
});

test("le pilotage affiche le libellé de tâche comme titre cliquable", () => {
  assert.match(tasks, /title: item\.label/);
  assert.match(tasks, /href: getDailySessionTaskHref\(item\.item_key, session\.id\)/);
  assert.match(tasks, /const sessionLabel = formation\?\.title \|\| session\.internal_reference/);
});
