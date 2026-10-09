import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const reviewSource = await readFile(new URL("../src/components/daily/DailyFormationReview.tsx", import.meta.url), "utf8");
const editorSource = await readFile(new URL("../src/components/daily/DailyPrerequisiteRequirementsEditor.tsx", import.meta.url), "utf8");

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
