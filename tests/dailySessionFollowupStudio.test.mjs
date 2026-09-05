import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dailyPage = readFileSync(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
const followupPage = readFileSync(new URL("../src/app/agent/daily/suivi-sessions/page.tsx", import.meta.url), "utf8");

test("Pilotage Daily expose le suivi des sessions", () => {
  assert.match(dailyPage, /href="\/agent\/daily\/suivi-sessions"/);
  assert.match(dailyPage, /Suivi sessions & incidents/);
});

test("le suivi réutilise la table canonique existante", () => {
  assert.match(followupPage, /\.from\("daily_session_followup_entries"\)/);
  assert.match(followupPage, /daily_session_followup_entries<\/code>/);
  assert.doesNotMatch(followupPage, /daily_incidents/);
});

test("la vue distingue incidents, adaptations, notes et criticité", () => {
  assert.match(followupPage, /incident: "Incident"/);
  assert.match(followupPage, /adaptation: "Adaptation"/);
  assert.match(followupPage, /note: "Note de suivi"/);
  assert.match(followupPage, /critical: "Critique"/);
  assert.match(followupPage, /entry\.status === "open"/);
});

test("la vue Studio reste en lecture seule", () => {
  assert.match(followupPage, /requireSupportAgent\(\)/);
  assert.doesNotMatch(followupPage, /\.insert\(/);
  assert.doesNotMatch(followupPage, /\.update\(/);
  assert.doesNotMatch(followupPage, /\.delete\(/);
  assert.doesNotMatch(followupPage, /\.upsert\(/);
});
