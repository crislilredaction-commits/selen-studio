import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260915133000_daily_document_links.sql", import.meta.url), "utf8");

test("un document Daily peut être rattaché à plusieurs entités sans dupliquer le fichier", () => {
  assert.match(migration, /references public\.daily_documents\(id\) on delete cascade/);
  assert.match(migration, /unique \(document_id, entity_type, entity_id\)/);
  for (const entity of ["organisation", "trainer", "learner", "formation", "session", "enrolment"]) {
    assert.match(migration, new RegExp(`'${entity}'`));
  }
});

test("les rattachements sont bornés à un organisme et tracent l'agent", () => {
  assert.match(migration, /organisation_id uuid not null references public\.organisations\(id\)/);
  assert.match(migration, /created_by_agent_profile_id uuid null references public\.agent_profiles\(id\)/);
  assert.match(migration, /enable row level security/);
});
