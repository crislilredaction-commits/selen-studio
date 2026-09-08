import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const layout = await readFile(new URL("../src/app/agent/daily/layout.tsx", import.meta.url), "utf8");
const dailyPage = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
const planningPage = await readFile(new URL("../src/app/agent/daily/planning/page.tsx", import.meta.url), "utf8");
const indicatorsPage = await readFile(new URL("../src/app/agent/daily/indicateurs/page.tsx", import.meta.url), "utf8");
const organisationLayout = await readFile(new URL("../src/app/agent/daily/organisations/[id]/layout.tsx", import.meta.url), "utf8");
const globalCss = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("la navigation Studio Daily expose les écrans métier déjà disponibles", () => {
  const expectedRoutes = [
    "/agent/daily",
    "/agent/daily/planning",
    "/agent/daily/organisations",
    "/agent/daily/session-dossiers",
    "/agent/daily/indicateurs",
    "/agent/daily/pretraining-documents",
    "/agent/daily/posttraining-documents",
    "/agent/daily/communications",
    "/agent/daily/preaudit",
    "/agent/daily/qualite",
  ];

  for (const route of expectedRoutes) {
    assert.match(layout, new RegExp(`href=\\"${route.replaceAll("/", "\\/")}\\"`));
  }
});

test("la navigation et le planning Daily ont un comportement mobile explicite", () => {
  assert.match(layout, /className="daily-subnav"/);
  assert.match(planningPage, /className="daily-planning-page"/);
  assert.match(planningPage, /className="daily-summary-grid"/);
  assert.match(globalCss, /\.daily-subnav[\s\S]*overflow-x: auto/);
  assert.match(globalCss, /\.daily-summary-grid[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(globalCss, /@media \(max-width: 480px\)[\s\S]*\.daily-summary-grid[\s\S]*grid-template-columns: 1fr/);
});

test("le conteneur Daily impose une base mobile aux vues encore desktop", () => {
  assert.match(layout, /className="daily-content"/);
  assert.match(globalCss, /\.daily-content\s*\{[\s\S]*min-width: 0/);
  assert.match(globalCss, /@media \(max-width: 820px\)[\s\S]*\.daily-content > main[\s\S]*padding-left: 12px[\s\S]*padding-right: 12px/);
  assert.match(globalCss, /@media \(max-width: 820px\)[\s\S]*\.daily-content > main > header[\s\S]*flex-direction: column/);
  assert.match(globalCss, /@media \(max-width: 480px\)[\s\S]*\.daily-content > main > header > a[\s\S]*width: 100%/);
});

test("le pilotage Daily replie explicitement ses blocs principaux sur mobile", () => {
  for (const className of ["daily-page", "daily-hero", "daily-counter", "daily-shortcut", "daily-task-head", "daily-task-actions"]) {
    assert.match(dailyPage, new RegExp(`className=\\"${className}\\"`));
  }
  assert.match(globalCss, /\.daily-page,[\s\S]*\.daily-planning-page[\s\S]*padding: 20px 12px 60px/);
  assert.match(globalCss, /\.daily-hero,[\s\S]*\.daily-shortcut,[\s\S]*\.daily-task-head[\s\S]*flex-direction: column/);
  assert.match(globalCss, /\.daily-shortcut > a[\s\S]*width: 100%/);
  assert.match(globalCss, /@media \(max-width: 480px\)[\s\S]*\.daily-task-actions[\s\S]*flex-direction: column/);
});

test("le planning est borné au périmètre canonique des organismes Daily actifs", () => {
  assert.match(planningPage, /getActiveDailyOrganisationIds/);
  assert.match(planningPage, /\.from\("daily_session_dossiers"\)[\s\S]*\.in\("organisation_id", organisationIds\)/);
  assert.match(planningPage, /organisationIds\.length\s*\?\s*await admin/);
});

test("les indicateurs formation dérivent des sources Daily existantes et restent bornés aux abonnements actifs", () => {
  assert.match(indicatorsPage, /getActiveDailyOrganisationIds/);
  for (const table of [
    "daily_sessions",
    "daily_session_enrolments",
    "daily_attendance_records",
    "daily_learning_assessments",
    "daily_learner_feedback_responses",
    "daily_stakeholder_satisfaction_responses",
  ]) {
    assert.match(indicatorsPage, new RegExp(`\\.from\\(\\"${table}\\"\\)[\\s\\S]*?\\.in\\(\\"organisation_id\\", organisationIds\\)`));
  }
});

test("l’auto-attribution Studio Daily reste au tutoiement", () => {
  assert.match(organisationLayout, /Tu peux prendre ce dossier en charge/);
  assert.doesNotMatch(organisationLayout, /Vous pouvez prendre ce dossier en charge/);
});
