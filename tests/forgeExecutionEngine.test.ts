import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file: string) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("les checkpoints techniques ne sont plus pilotables manuellement", async () => {
  const panel = await read("src/components/forge/MissionCheckpointPanel.tsx");
  assert.match(panel, /checkpoint\.position < 3/);
  assert.match(panel, /piloté par le worker Cody/);
});

test("une exécution exige un plan courant réellement validé", async () => {
  const sql = await read("supabase/migrations/20260730184300_create_forge_execution_engine.sql");
  assert.match(sql, /is_current=true and status='validated'/);
  assert.match(sql, /mission_row\.execution_plan_id/);
  assert.match(sql, /mission_row\.planning_validated_at is null/);
  assert.match(sql, /jsonb_array_length\(plan_row\.blocking_questions\)>0/);
  assert.match(sql, /category='critical_error'/);
});

test("la réservation est atomique et idempotente", async () => {
  const sql = await read("supabase/migrations/20260730184300_create_forge_execution_engine.sql");
  assert.match(sql, /for update skip locked limit 1/);
  assert.match(sql, /forge_execution_runs_active_mission_idx/);
  assert.match(sql, /if existing_id is not null then return existing_id/);
});

test("le checkpoint branche exige une preuve Git", async () => {
  const sql = await read("supabase/migrations/20260730184300_create_forge_execution_engine.sql");
  assert.match(sql, /p_git_commit_sha !~ '\^\[0-9a-f\]\{40\}\$'/);
  assert.match(sql, /git_commit_sha=p_git_commit_sha/);
  assert.match(sql, /checkpoint_key='branch_created'/);
  assert.match(sql, /status='completed'/);
});

test("le worker est protégé et masque le jeton dans les erreurs", async () => {
  const route = await read("src/app/agent/api/jobs/forge-cody-execution/route.ts");
  const worker = await read("src/lib/server/forgeExecutionWorker.ts");
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /FORGE_EXECUTION_WORKER_SECRET/);
  assert.match(worker, /replaceAll\(token, "\[secret masqué\]"\)/);
  assert.match(worker, /mkdtemp/);
  assert.match(worker, /rm\(directory, \{ recursive: true, force: true \}\)/);
});

test("les routes d'exécution restent admin-only et service-role serveur", async () => {
  const route = await read("src/app/agent/api/forge/executions/route.ts");
  assert.match(route, /requireStudioAdmin/);
  assert.match(route, /createSupabaseAdminClient/);
  assert.doesNotMatch(route, /NEXT_PUBLIC.*SERVICE/);
});
