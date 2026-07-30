import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "../supabase/migrations/20260730174200_connect_cody_human_actions_to_alerts.sql";

test("les précisions requises créent une alerte Cody liée et dédupliquée", async () => {
  const sql = await readFile(new URL(migrationPath, import.meta.url), "utf8");

  assert.match(sql, /new\.status = 'needs_clarification'/);
  assert.match(sql, /'mission-clarification:' \|\| new\.id::text/);
  assert.match(sql, /'human_decision_required'/);
  assert.match(sql, /p_plan_id => current_plan_id/);
  assert.match(sql, /'action_required'/);
  assert.match(sql, /'\/agent\/forge\/cody\?mission='/);
});

test("la réponse humaine résout l’alerte de précision", async () => {
  const sql = await readFile(new URL(migrationPath, import.meta.url), "utf8");

  assert.match(
    sql,
    /old\.status = 'needs_clarification'[\s\S]*new\.status <> 'needs_clarification'[\s\S]*forge_resolve_source_alerts/
  );
  assert.match(
    sql,
    /not exists \([\s\S]*p\.is_current = true[\s\S]*p\.status = 'needs_clarification'/
  );
});

test("les validations, incidents bloquants et reprises restent raccordés", async () => {
  const sql = await readFile(new URL(migrationPath, import.meta.url), "utf8");

  assert.match(sql, /new\.status = 'plan_ready'/);
  assert.match(sql, /'plan_validation_required'/);
  assert.match(sql, /new\.resolution_status = 'blocked'/);
  assert.match(sql, /'mission_ready_to_resume'/);
  assert.match(
    sql,
    /mission_ready_to_resume'[\s\S]*'action_required'/
  );
});

test("les fonctions de trigger restent invoker et inaccessibles aux clients", async () => {
  const sql = await readFile(new URL(migrationPath, import.meta.url), "utf8");

  assert.equal((sql.match(/security invoker/g) ?? []).length, 3);
  assert.match(
    sql,
    /revoke all on function public\.forge_sync_mission_alerts\(\)[\s\S]*from public, anon, authenticated/
  );
  assert.doesNotMatch(sql, /security definer/);
});
