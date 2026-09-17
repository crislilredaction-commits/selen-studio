import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("src/app/agent/daily/sessions/[id]/page.tsx", "utf8");

test("P0-B affiche une synthèse de traitement sans moteur parallèle", () => {
  for (const label of ["Dossier reçu", "Pièces", "Prérequis", "Analyse", "Décision"]) assert.match(source, new RegExp(label));
  assert.match(source, /daily_registration_responses/);
  assert.match(source, /registration_status/);
  assert.match(source, /LegacyAgentDailySessionPage/);
  assert.match(source, /actions canoniques existantes/);
});

test("P0-B conserve le contrôle agent côté serveur", () => {
  assert.match(source, /requireSupportAgent\(\)/);
  assert.match(source, /Accès refusé/);
});
