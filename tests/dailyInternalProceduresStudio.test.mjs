import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dailyPage = readFileSync(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
const proceduresPage = readFileSync(new URL("../src/app/agent/daily/procedures-internes/page.tsx", import.meta.url), "utf8");

test("Pilotage Daily expose le suivi des procédures internes", () => {
  assert.match(dailyPage, /href="\/agent\/daily\/procedures-internes"/);
  assert.match(dailyPage, /Procédures internes/);
});

test("le suivi réutilise daily_internal_procedures sans stockage parallèle", () => {
  assert.match(proceduresPage, /\.from\("daily_internal_procedures"\)/);
  assert.match(proceduresPage, /daily_internal_procedures<\/code>/);
  assert.doesNotMatch(proceduresPage, /daily_internal_procedure_reminders/);
});

test("la vue signale les brouillons et la revue documentaire annuelle", () => {
  assert.match(proceduresPage, /procedure\.status === "draft"/);
  assert.match(proceduresPage, /365 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(proceduresPage, /Revue annuelle à prévoir/);
  assert.match(proceduresPage, /vérifiée au moins une fois par an/i);
});

test("la vue Studio reste en lecture seule", () => {
  assert.match(proceduresPage, /requireSupportAgent\(\)/);
  assert.doesNotMatch(proceduresPage, /\.insert\(/);
  assert.doesNotMatch(proceduresPage, /\.update\(/);
  assert.doesNotMatch(proceduresPage, /\.delete\(/);
  assert.doesNotMatch(proceduresPage, /\.upsert\(/);
});
