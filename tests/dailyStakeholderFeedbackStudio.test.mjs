import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dailyPage = readFileSync(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
const feedbackPage = readFileSync(new URL("../src/app/agent/daily/reclamations/page.tsx", import.meta.url), "utf8");

test("Pilotage Daily expose le suivi des réclamations et suggestions", () => {
  assert.match(dailyPage, /href="\/agent\/daily\/reclamations"/);
  assert.match(dailyPage, /Réclamations & suggestions/);
});

test("le suivi réutilise daily_stakeholder_feedback comme source unique", () => {
  assert.match(feedbackPage, /\.from\("daily_stakeholder_feedback"\)/);
  assert.match(feedbackPage, /daily_stakeholder_feedback<\/code>/);
  assert.doesNotMatch(feedbackPage, /daily_incidents/);
  assert.doesNotMatch(feedbackPage, /daily_complaints/);
});

test("la vue est bornée au périmètre canonique des organismes Daily actifs", () => {
  assert.match(feedbackPage, /getActiveDailyOrganisationIds/);
  assert.match(feedbackPage, /\.from\("daily_stakeholder_feedback"\)[\s\S]*\.in\("organisation_id", organisationIds\)/);
  assert.match(feedbackPage, /\.from\("organisations"\)[\s\S]*\.in\("id", organisationIds\)/);
  assert.match(feedbackPage, /organisationIds\.length\s*\?\s*await Promise\.all/);
});

test("la vue distingue les retours ouverts des retours résolus", () => {
  assert.match(feedbackPage, /status === "resolved"/);
  assert.match(feedbackPage, /Réclamation/);
  assert.match(feedbackPage, /Suggestion/);
  assert.match(feedbackPage, /encore ouvert\(s\)/);
});

test("la vue Studio reste en lecture seule", () => {
  assert.match(feedbackPage, /requireSupportAgent\(\)/);
  assert.doesNotMatch(feedbackPage, /\.insert\(/);
  assert.doesNotMatch(feedbackPage, /\.update\(/);
  assert.doesNotMatch(feedbackPage, /\.delete\(/);
  assert.doesNotMatch(feedbackPage, /\.upsert\(/);
});
