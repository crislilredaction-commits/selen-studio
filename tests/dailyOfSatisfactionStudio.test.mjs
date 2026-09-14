import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/app/agent/daily/session-dossiers/[id]/satisfaction/page.tsx", import.meta.url), "utf8");
const trackingPage = await readFile(new URL("../src/app/agent/daily/satisfaction/page.tsx", import.meta.url), "utf8");
const dailyLayout = await readFile(new URL("../src/app/agent/daily/layout.tsx", import.meta.url), "utf8");

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

test("le tableau satisfaction est accessible depuis la navigation Daily", () => {
  assert.match(dailyLayout, /href="\/agent\/daily\/satisfaction"/);
  assert.match(dailyLayout, />Satisfaction<\/Link>/);
});

test("le tableau satisfaction borne toutes les sources au périmètre agent", () => {
  assert.match(trackingPage, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(trackingPage, /\.from\("daily_sessions"\)[\s\S]*\.in\("organisation_id", organisationIds\)/);
  assert.match(trackingPage, /\.from\("daily_session_enrolments"\)[\s\S]*\.in\("organisation_id", organisationIds\)/);
  assert.match(trackingPage, /\.from\("daily_learner_feedback_responses"\)[\s\S]*\.in\("organisation_id", organisationIds\)/);
  assert.match(trackingPage, /\.from\("daily_stakeholder_satisfaction_responses"\)[\s\S]*\.in\("organisation_id", organisationIds\)/);
});

test("le tableau sépare apprenants commanditaire formateur et retour OF", () => {
  assert.match(trackingPage, /Satisfaction apprenant incomplète/);
  assert.match(trackingPage, /Commanditaire/);
  assert.match(trackingPage, /Formateur/);
  assert.match(trackingPage, /OF · plateforme/);
  assert.match(trackingPage, /company", "enterprise"/);
});
