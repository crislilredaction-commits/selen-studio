import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("src/app/agent/daily/sessions/[id]/page.tsx", "utf8");
const documentReviewSource = fs.readFileSync("src/app/agent/daily/pretraining-documents/page.tsx", "utf8");

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

test("P0-B expose les pièces via le circuit documentaire canonique de la session", () => {
  assert.match(source, /daily_documents/);
  assert.match(source, /\.eq\("session_id", id\)/);
  assert.match(source, /\.eq\("is_current", true\)/);
  assert.match(source, /Pièces du dossier/);
  assert.match(source, /pretraining-documents\?session=/);
  assert.match(source, /Le dépôt d’une pièce ne vaut pas validation/);
  assert.match(documentReviewSource, /useSearchParams/);
  assert.match(documentReviewSource, /searchParams\.get\("session"\)/);
  assert.match(documentReviewSource, /doc\.session_id/);
  assert.match(documentReviewSource, /sessionKey\(d\)===sessionFilter/);
});

test("P0-B expose l'analyse humaine depuis la source canonique avec auteur et horodatage", () => {
  assert.match(source, /daily_registration_reviews/);
  assert.match(source, /prerequisites_validated/);
  assert.match(source, /positioning_result/);
  assert.match(source, /adaptation_required/);
  assert.match(source, /decision/);
  assert.match(source, /evaluator_name/);
  assert.match(source, /validated_at/);
  assert.match(source, /Analyse humaine/);
  assert.match(source, /Ouvrir l’analyse et les contrôles/);
});

test("P0-B bloque côté serveur une validation incomplète et reflète le blocage dans l'UI", () => {
  assert.match(source, /function validationBlockReason/);
  assert.match(source, /status !== "summary_to_review"/);
  assert.match(source, /responseCount < 1/);
  assert.match(source, /review\.prerequisites_validated !== true/);
  assert.match(source, /!review\.decision/);
  assert.match(source, /!review\?\.validated_at/);
  assert.match(source, /if \(blocked\) throw new Error\(blocked\)/);
  assert.match(source, /\.eq\("registration_status", "summary_to_review"\)/);
  assert.match(source, /disabled: Boolean\(blockedReason\)/);
  assert.match(source, /Validation bloquée/);
});

test("P0-B conserve le contrôle agent côté serveur", () => {
  assert.match(source, /requireSupportAgent\(\)/);
  assert.match(source, /Accès refusé/);
});
