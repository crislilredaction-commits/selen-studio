import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync("src/app/agent/layout.tsx", "utf8");

test("le segment agent reste dynamique pour ne jamais interroger Supabase au pré-rendu statique", () => {
  assert.match(layout, /export const dynamic = ["']force-dynamic["']/);
});

test("le layout agent refuse un utilisateur authentifié sans profil agent actif", () => {
  assert.match(layout, /supabase\.auth\.getUser\(\)/);
  assert.match(layout, /from\("agent_profiles"\)/);
  assert.match(layout, /eq\("is_active", true\)/);
  assert.match(layout, /if \(!profile && !adminUser\) notFound\(\)/);
});

test("le garde d'accès accepte aussi les comptes admin Studio actifs", () => {
  assert.match(layout, /from\("selen_admin_users"\)/);
  assert.match(layout, /eq\("email", email\)/);
});

test("le contrôle d'accès s'exécute avant le rendu de l'interface Studio", () => {
  const guardCall = layout.indexOf("await assertActiveAgentAccess()");
  const sidebar = layout.indexOf("<AgentSidebar />");
  assert.ok(guardCall >= 0);
  assert.ok(sidebar > guardCall);
});
