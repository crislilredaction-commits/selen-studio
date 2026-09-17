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

test("P0-B met en avant l'action utile et les incohérences sans inventer de statut", () => {
  assert.match(source, /function treatmentSignal/);
  assert.match(source, /Contrôles à effectuer/);
  assert.match(source, /Analyse à relire/);
  assert.match(source, /Incohérence à contrôler/);
  assert.match(source, /En attente du dossier/);
  assert.match(source, /traitement-canonique/);
  assert.match(source, /Aller aux actions du dossier/);
});

test("P0-B conserve le contrôle agent côté serveur", () => {
  assert.match(source, /requireSupportAgent\(\)/);
  assert.match(source, /Accès refusé/);
});
