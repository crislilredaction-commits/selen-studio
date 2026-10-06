import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20261006081754_daily_a8_portal_access_lifecycle.sql", import.meta.url), "utf8");
const directAccess = await readFile(new URL("../src/lib/server/dailyDirectSessionPortalAccess.ts", import.meta.url), "utf8");

test("A8 conserve l'historique tout en autorisant la révocation immédiate d'un portail", () => {
  assert.match(migration, /drop constraint if exists daily_portal_access_tokens_status_check/);
  assert.match(migration, /'pending', 'viewed', 'revoked', 'expired'/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.daily_portal_access_tokens/i);
});

test("A8 renouvelle un accès révoqué au lieu de le considérer actif", () => {
  assert.match(directAccess, /"pending" \| "viewed" \| "revoked" \| "expired"/);
  assert.match(directAccess, /access\.status === "expired" \|\| access\.status === "revoked"/);
  assert.match(directAccess, /onConflict: "session_id,portal_type,entity_key"/);
});
