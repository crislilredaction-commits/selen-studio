import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sidebar = await readFile(new URL("../src/components/layout/AgentSidebar.tsx", import.meta.url), "utf8");

test("E1b retire les entrées redondantes du menu métier", () => {
  assert.doesNotMatch(sidebar, /href:\s*"\/agent\/generateur-dossiers-formation"/);
  assert.doesNotMatch(sidebar, /href:\s*"\/agent\/profil"/);
});

test("E1b conserve Mon profil dans le menu utilisateur", () => {
  assert.match(sidebar, /data-user-menu/);
  assert.match(sidebar, /href="\/agent\/profil"/);
  assert.match(sidebar, />\s*Mon profil\s*</);
});
