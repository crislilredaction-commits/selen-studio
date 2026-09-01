import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../src/app/agent/api/support/create/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../src/app/agent/support/new/page.tsx", import.meta.url), "utf8");
const quickLink = await readFile(new URL("../src/components/support/SupportQuickCreateLink.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../src/app/agent/layout.tsx", import.meta.url), "utf8");

test("la création manuelle est protégée par l'authentification agent", () => {
  assert.match(route, /requireSupportAgent\(\)/);
  assert.match(route, /assigned_agent_email: auth\.email/);
  assert.match(route, /source: "studio_manual_ticket"/);
});

test("le ticket enregistre la demande initiale dans l'historique support", () => {
  assert.match(route, /from\("support_tickets"\)/);
  assert.match(route, /from\("support_messages"\)/);
  assert.match(route, /sender_type: "client"/);
  assert.match(route, /captured_by_agent: true/);
});

test("le formulaire couvre réclamation, Daily et les priorités", () => {
  assert.match(page, /\["reclamation", "Réclamation"\]/);
  assert.match(page, /\["daily", "Daily"\]/);
  assert.match(page, /\["urgent", "Urgente"\]/);
  assert.match(page, /\/agent\/api\/support\/create/);
});

test("le support expose un accès direct au ticket manuel", () => {
  assert.match(quickLink, /pathname\.startsWith\("\/agent\/support"\)/);
  assert.match(quickLink, /href="\/agent\/support\/new"/);
  assert.match(layout, /<SupportQuickCreateLink \/>/);
});
