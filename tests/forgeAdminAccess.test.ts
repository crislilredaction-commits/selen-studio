import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("le layout Forge refuse avant de rendre ses sous-routes", async () => {
  const source = await read("src/app/agent/forge/layout.tsx");
  assert.match(source, /await requireForgeAdminPage\(\)/);
  assert.ok(
    source.indexOf("await requireForgeAdminPage()") < source.indexOf("return children"),
    "le contrôle administrateur doit précéder le rendu",
  );
});

test("la navigation Forge et ses alertes sont réservées aux administrateurs", async () => {
  const source = await read("src/components/layout/AgentSidebar.tsx");
  assert.match(source, /href:\s*"\/agent\/forge",[\s\S]*?adminOnly:\s*true/);
  assert.match(source, /href:\s*"\/agent\/forge\/alerts",[\s\S]*?adminOnly:\s*true/);
  assert.match(source, /if \(resolvedRole === "admin"\) \{[\s\S]*?\.from\("forge_alerts"\)/);
});

test("l’API de planification Forge exige le rôle administrateur", async () => {
  const source = await read("src/app/agent/api/forge/planning/route.ts");
  assert.match(source, /import \{ requireStudioAdmin \}/);
  assert.match(source, /const auth = await requireStudioAdmin\(\)/);
  assert.doesNotMatch(source, /requireStudioAgent/);
});

test("le worker Telegram reste technique, Production uniquement", async () => {
  const source = await read("src/app/agent/api/jobs/forge-telegram-alerts/route.ts");
  assert.match(source, /process\.env\.VERCEL_ENV !== "production"/);
  assert.match(source, /authorization/);
  assert.match(source, /forge_begin_telegram_worker_run/);
});
