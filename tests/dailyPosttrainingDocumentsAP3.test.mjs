import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const route=fs.readFileSync("src/app/agent/api/daily/posttraining-documents/route.ts","utf8");
const migration=fs.readFileSync("supabase/migrations/20261008180438_daily_posttraining_documents_ap3.sql","utf8");

test("AP3 Studio excludes documents whose session or enrolment no longer has an active action",()=>{
  assert.match(route,/daily_sessions!inner\(status\)/);
  assert.match(route,/\["cancelled","archived"\]/);
  assert.match(route,/\["declined","cancelled","abandoned"\]/);
  assert.match(route,/activeSessions\.has/);
  assert.match(route,/activeEnrolments\.has/);
  assert.match(route,/Ce document est sans objet car son dossier métier n’est plus actif/);
});

test("AP3 shares the atomic document registry migration with Daily",()=>{
  assert.match(migration,/daily_register_posttraining_document/);
  assert.match(migration,/pg_advisory_xact_lock/);
  assert.match(migration,/daily_posttraining_document_current_scope_unique/);
  assert.match(migration,/to service_role/);
});
