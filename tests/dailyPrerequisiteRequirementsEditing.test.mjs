import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const reviewSource = await readFile(new URL("../src/components/daily/DailyFormationReview.tsx", import.meta.url), "utf8");
const editorSource = await readFile(new URL("../src/components/daily/DailyPrerequisiteRequirementsEditor.tsx", import.meta.url), "utf8");
const formSource = await readFile(new URL("../src/components/daily/DailyPrerequisiteRequirementsForm.tsx", import.meta.url), "utf8");

test("la sauvegarde Studio synchronise les exigences et leur mode", () => {
  assert.match(reviewSource, /prerequisite_requirements:\s*prerequisiteRequirements/);
  assert.match(reviewSource, /prerequisite_mode:\s*prerequisiteRequirements\.length\s*>\s*0\s*\?\s*["']required["']\s*:\s*["']none["']/);
});

test("l’éditeur suit le positionnement et précède l’évaluation finale", () => {
  const positioning = reviewSource.indexOf("Questionnaire de positionnement");
  const prerequisites = reviewSource.indexOf("Justificatifs des prérequis");
  const finalAssessment = reviewSource.indexOf("Évaluation finale", prerequisites);
  assert.ok(positioning >= 0 && prerequisites > positioning && finalAssessment > prerequisites);
});

test("Studio expose explicitement le caractère obligatoire ou facultatif", () => {
  assert.match(editorSource, /row\.required\s*!==\s*false/);
  assert.match(editorSource, /Obligatoire pour l(?:’|')admission/);
  assert.match(editorSource, /facultative peut être laissée vide/);
});

test("une action dédiée conserve le statut et protège les dossiers historiques", () => {
  assert.match(reviewSource, /daily_update_formation_prerequisites/);
  assert.match(reviewSource, /saved\.status\s*!==\s*formation\.status/);
  assert.match(reviewSource, /loadScopedDailyFormation\(admin,\s*auth\.email/);
  assert.match(formSource, /Enregistrer les justificatifs/);
  assert.match(formSource, /aria-busy=\{pending\}/);
});
