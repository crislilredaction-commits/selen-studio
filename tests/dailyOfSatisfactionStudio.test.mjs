import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/app/agent/daily/session-dossiers/[id]/satisfaction/page.tsx", import.meta.url), "utf8");

test("Studio distingue le retour OF sur la plateforme", () => {
  assert.match(page, /client: "OF · retour plateforme"/);
  assert.match(page, /Retour OF plateforme/);
  assert.match(page, /Note plateforme/);
  assert.match(page, /Apprécié/);
  assert.match(page, /Moins bien/);
  assert.match(page, /Suggestions/);
});

test("Studio utilise company comme type canonique commanditaire tout en tolérant l'historique enterprise", () => {
  assert.match(page, /company: "Commanditaire"/);
  assert.match(page, /enterprise: "Commanditaire \(historique\)"/);
  assert.match(page, /stakeholder_type === "company" \|\| item\.stakeholder_type === "enterprise"/);
});
