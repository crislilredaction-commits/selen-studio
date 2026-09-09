import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/lib/server/studioClientFollowups.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260909125000_daily_signature_client_reminders.sql", import.meta.url), "utf8");

// Cette garde est volontairement branchée au build pour valider le lot complet avant fusion.
test("seule une relance signature future reste cachée de la file Studio", () => {
  assert.match(source, /SIGNATURE_REMINDER = "daily_signature_pending_72h"/);
  assert.match(source, /row\.reminder_type === SIGNATURE_REMINDER && !isDue\(row\.due_at\)/);
});

test("la règle équipe à 72 h reste basée sur la mise en attente sans réassignation", () => {
  assert.match(source, /72 \* 60 \* 60 \* 1000/);
  assert.match(source, /assigned_agent_profile_id/);
  assert.match(source, /staff\.id === agentId \|\| overdueShared/);
  assert.doesNotMatch(source, /daily_organisation_assignments.*update|\.from\("daily_organisation_assignments"\).*\.update/s);
});

test("le schéma partagé autorise le rappel signature et sa clôture sans suppression", () => {
  assert.match(migration, /daily_signature_pending_72h/);
  assert.match(migration, /'resolved'/);
  assert.doesNotMatch(migration, /drop table|delete from|truncate/i);
});
